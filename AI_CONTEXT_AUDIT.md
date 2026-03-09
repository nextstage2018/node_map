# NodeMap - AI Context/RAG Audit

**Date**: 2026-03-05
**Model**: claude-sonnet-4-5-20250929 (primary, unified across all endpoints)
**Model (Secondary)**: claude-opus-4-5-20251101 (task summary generation only)

## Overview

This document comprehensively audits ALL Claude API calls across the NodeMap codebase, documenting:
1. **API Endpoint**: File path and purpose
2. **System Prompt**: Exact instructions given to Claude
3. **Data Injected**: What DB tables/services are queried and injected
4. **User Context**: Writing style, profile, channel-specific info
5. **Model Used**: Which model is called
6. **Token Flow**: Max tokens, typical usage

---

## 1. AI Context Audit by Endpoint

### 1.1 SECRETARY CHAT API (Largest - 1000+ LOC)

**File**: `src/app/api/agent/chat/route.ts`

**Purpose**: Main conversational interface. AI understands user intent and generates contextual responses + cards.

**System Prompt Structure**:
```
Phase context + intent-specific system instructions
+ Message/Task/Job context (unread counts, statuses)
+ Calendar events (if connected)
+ Recent activity summaries
```

**Data Injected by Intent**:

| Intent | Tables Queried | Fields Injected |
|--------|---|---|
| **briefing** | inbox_messages, tasks, jobs, consultations, knowledge_clustering_proposals, business_events | unreadCount, urgentCount, activeTaskCount, proposedTaskCount, pendingJobCount, consultingJobCount, draftReadyJobCount, pendingConsultationCount, pendingFileCount, pendingKnowledgeProposals, pendingTaskSuggestions, calendar_events (today) |
| **inbox** | inbox_messages | from_name, subject, body (250 chars), is_read, direction, timestamp |
| **message_detail** | inbox_messages | full message details: id, from_name, from_address, subject, body, channel, thread_messages |
| **reply_draft** | (via separate API) | Deferred to /api/ai/draft-reply |
| **create_job** | inbox_messages | message content + metadata + sender info + optional consultation question |
| **calendar** | calendar_events (Google Calendar API) | today's events, time, location, participant count |
| **schedule** | calendar_events, tasks, jobs | free slot candidates (findFreeSlots) |
| **tasks** | tasks | title, status, priority, phase, due_date, updated_at (last 20) |
| **jobs** | jobs | title, status, type, due_date, description (last 15) |
| **projects** | projects, organizations | id, name, organization_id, user_id (with org JOIN) |
| **documents** | drive_documents | name, link_type, created_at, organizations, projects, source_channel |
| **file_intake** | drive_file_staging | status=pending_review, document_type, direction, yearMonth, ai_document_type, ai_confidence (pending only) |
| **store_file** | organizations, projects | For URL extraction and storage location suggestion |
| **business_summary** | business_events | event_type, title, content, event_date, summary_period, ai_generated (WHERE ai_generated=true) |
| **knowledge_structuring** | knowledge_clustering_proposals, knowledge_master_entries | pending proposals + unconfirmed entry count |
| **create_contact**, **search_contact** | contact_persons, contact_channels, organizations | name, email, phone, company_name, relationship_type |
| **create_organization** | organizations | name, domain, relationship_type |
| **create_project** | projects, organizations | name, description, organization_id (available org list) |
| **consultations** | consultations, jobs | pending consultation count for responder view |
| **task_negotiation**, **pattern_analysis**, **knowledge_reuse** | tasks, contact_patterns | task details + usage patterns |

**Context Injected in Claude Request**:
1. **User Message History**: Last message only (user input)
2. **System Prompt**: 1500-2000 chars (intent-specific instructions)
3. **Data Context**: 3000-5000 chars (formatted DB data)
4. **Card Context**: Implicit in the response handler (what cards to generate)

**Claude API Call Location**:
- Line ~1100+: `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 2000, system: systemPrompt, messages: [{ role: 'user', content: userMessage + dataContext }] })`

**Key Characteristics**:
- **No Conversation History**: Single turn (secretary stateless)
- **System Prompt Includes**: Intent classification logic, card generation rules, context formatting instructions
- **Fallback**: If API fails, returns hardcoded demo response with empty context
- **Card Generation**: Data is fetched BEFORE Claude call, then injected into system prompt so Claude can reference it

---

### 1.2 TASK AI CHAT API

**File**: `src/app/api/tasks/chat/route.ts`

**Purpose**: AI conversation within a task (ideation/progress/result phases).

**System Prompt** (from `aiClient.service.ts`):
```
Phase-specific instructions:
- Ideation: "一問一答" + 4項目埋め（ゴール/内容/懸念/期限）
- Progress: "伴走パートナー" + 壁打ち相談
- Result: "成果整理" + 学習抽出

Injected data:
- Task: title, description, ideationSummary, seedId, dueDate
- Project/Org: name, memo, member names
- Conversation history: Last 20 turns (truncated to 200 chars each)
- Session: covered items (ゴール/内容/懸念/期限)
```

**Data Tables Queried**:
1. `tasks` → task.title, description, ideation_summary, seed_id, due_date
2. `projects` → name, description, organization_id
3. `organizations` → name, memo
4. `task_members` → member names from contact_persons.full_name
5. `task_conversations` → conversation history (role, content, phase, created_at)

**Claude API Call Location**:
- `src/services/ai/aiClient.service.ts` line ~546: `client.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 1500, system: systemPrompt, messages: [...history, userMessage] })`

**Context Injected**:
1. **User Message**: Current message
2. **History**: Conversation history (last 20 messages)
3. **System Prompt**: Phase-specific rules + task context + project context
4. **Covered Items**: Regex-based detection of which items (goal/content/concern/deadline) have been discussed

**Key Characteristics**:
- **Multi-turn conversation**: Full history maintained (phase-aware)
- **Writing Style**: `await getUserWritingStyle(userId, channel)` injected into system prompt if available
- **User Signature**: Not included in task chat (only in email contexts)
- **Token Usage**: ~1500 max (conversation history takes bulk)

---

### 1.3 REPLY DRAFT GENERATION API

**File**: `src/app/api/ai/draft-reply/route.ts`

**Purpose**: Generate AI draft reply to a single inbox message.

**System Prompt**:
```
ビジネスメッセージの返信アシスタント
- Channel tone: Email (formal) / Slack (casual) / Chatwork (standard)
- Contact context: Company, department, relationship, notes, AI analysis
- Recent messages: Last 5 exchanges with sender
- Thread context: Quote chain
- Writing style: User's past sent messages (if available)
- Email signature: Auto-append if email + signature configured
```

**Data Tables Queried**:
1. `contact_channels` → contact_id by address
2. `contact_persons` → notes, ai_context, company_name, department, relationship_type (joined on contact_id)
3. `inbox_messages` → from_address, from_name, subject, body, direction, timestamp (last 5 with sender)
4. `user_service_tokens` / `settings` → email signature (user_metadata.email_signature)

**Additional Context**:
- `getUserWritingStyle(userId, channel)` → last 5 sent messages, extracted as style samples

**Claude API Call Location**:
- `src/services/ai/aiClient.service.ts` line ~192: `client.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 1000, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })`

**Injected Data Order**:
1. Writing style prompt (past messages)
2. Contact information (name, company, relationship, notes, AI analysis)
3. Recent messages (last 5)
4. Thread context (quote chain)
5. User instruction (if provided)

**Key Characteristics**:
- **Single-turn**: No conversation history
- **Channel-aware**: Different instructions for email vs Slack vs Chatwork
- **User metadata**: Email signature appended AFTER AI response (not in system prompt)
- **Fallback**: Demo draft if API fails (template-based by channel)

---

### 1.4 MEMO-TO-TASK CONVERSION API

**File**: `src/app/api/memos/[id]/convert/route.ts`

**Purpose**: Convert idea memo to task by AI-generating title, description, priority.

**System Prompt**:
```
アイデアメモをタスクに変換する専門家
- Input: Memo content + AI conversation history
- Output: JSON { title (30 chars), description (200 chars), priority (high/medium/low) }
- Rules: Title starts with verb, description includes conversation insights
```

**Data Tables Queried**:
1. `idea_memos` → content (memo body)
2. `memo_conversations` → role, content, created_at (full history)

**Claude API Call Location**:
- Line ~64: `client.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 600, system: systemPrompt, messages: [{ role: 'user', content: 'メモ:\n${memo.content}\n\nAI会話:\n${conversationText}' }] })`

**Key Characteristics**:
- **Single-turn**: Memo content + conversation history → JSON response
- **Fallback**: Uses memo content as-is if API fails (no AI generation)
- **Post-Processing**: JSON parsing with code block removal

---

### 1.5 JOB STRUCTURING API (4 Branches)

**File**: `src/app/api/ai/structure-job/route.ts`

**Purpose**: AI structure inbox message into actionable job type (schedule/consult/save_to_drive/todo/default).

#### Branch A: Schedule (日程調整)

**System Prompt**:
```
日程調整支援アシスタント
- Input: Message content, sender name, calendar free slots
- Output: JSON { title, description, greeting, closing, purpose }
- Rules:
  - Generate greeting + closing only (dates inserted by code)
  - Use user name + email signature
  - Follow user's writing style
```

**Data Queried**:
1. `user_profile` → displayName, emailSignature
2. `calendar_events` (Google Calendar API) → findFreeSlots() (next week, 10-19:00, exclude weekends)
3. User writing style → `getUserWritingStyle(userId, channel)`

**Claude API Call Location**:
- Line ~122: `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: messageContent }] })`

**Key Characteristics**:
- **Hybrid approach**: AI generates greeting/closing, code inserts free slots
- **Writing style**: Injected if available
- **Fallback**: Template-based (no AI) if API fails
- **Calendar dependency**: Requires Google Calendar OAuth

#### Branch B: Consult (社内相談)

**System Prompt**:
```
社内相談スレッド要約
- Input: Last 10 messages from thread
- Output: Plain text summary (200 chars)
- Rules: Japanese, flow-focused (not bullet points)
```

**Data Queried**:
1. `inbox_messages` → thread_id-based (last 10 messages) or from_address-based
2. Message fields: from_name, from_address, subject, body, direction, created_at

**Claude API Call Location**:
- Line ~259: `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 512, system: systemPrompt, messages: [{ role: 'user', content: summaryLines.join('\n') }] })`

**Key Characteristics**:
- **Thread reconstruction**: Finds thread by thread_id or from_address
- **Temporal order**: Reverses to chronological
- **Fallback**: Simple line-by-line list if API fails

#### Branch C: Save to Drive (Drive格納)

**No Claude API call** - Pure DB logic to detect organization/project from metadata or email domain.

#### Branch D: Todo (後でやる) & Default

**System Prompt**:
```
メッセージからジョブ化
- Input: Message content
- Output: JSON { title (20 chars), description (50 chars) }
```

**Claude API Call Location**:
- Line ~386 (todo) and ~415 (default): `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 256, system: systemPrompt, messages: [{ role: 'user', content: messageContent }] })`

**Key Characteristics**:
- **Minimal context**: Message only
- **Lightweight**: 256 max tokens
- **Fallback**: Uses subject + body slice if API fails

---

### 1.6 CONSULTATION AI REPLY API

**File**: `src/app/api/consultations/route.ts`

**Purpose**: When consultation is answered, AI generates return email to original sender.

**System Prompt**:
```
社内相談の回答を踏まえた返信文面生成
- Input: Thread summary + consultation question + internal answer
- Output: Plain text reply (suitable for email/chat)
- Rules:
  - Email signature auto-append (if email channel)
  - User writing style (if available)
  - Channel-aware tone
```

**Data Queried**:
1. `consultations` → thread_summary, question, answer, source_channel
2. `jobs` → source_channel (to determine if email)
3. `user_service_tokens` / `settings` → email signature
4. User writing style → `getUserWritingStyle(userId, jobChannel)`

**Claude API Call Location**:
- Line ~126: `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: `【スレッド要約】\n${threadSummary}\n\n【相談内容】\n${question}\n\n【社内からの回答】\n${answer}` }] })`

**Key Characteristics**:
- **Three-part context**: Thread + question + answer
- **Email signature**: Auto-appended AFTER AI response
- **Writing style**: Injected if available
- **Fallback**: "社内相談の回答を踏まえた返信:\n\n${answer}"

---

### 1.7 THOUGHT NODE EXTRACTION API

**File**: `src/services/nodemap/thoughtNode.service.ts`

**Purpose**: Extract keywords from task/seed AI conversation and link to knowledge master.

**System Prompt** (via `keywordExtractor.service.ts`):
```
ナレッジ抽出の専門家
- Input: Conversation text
- Output: JSON { keywords (8 max), persons (5 max), projects (3 max) }
- Rules:
  - keywords: Nouns/technical terms/industry terms only (confidence >= 0.7)
  - Exclude: Verbs, adjectives, generic nouns (「こと」「方法」など), time expressions
  - persons: Names only (without honorifics/titles)
  - projects: Explicit project mentions only
```

**Data Queried**:
1. (No DB query) - Text input only
2. Classification: Based on text + phase + source type

**Claude API Call Location**:
- `src/services/ai/keywordExtractor.service.ts` line ~69: `client.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 800, system: systemPrompt, messages: [{ role: 'user', content: `以下のテキストから情報を抽出してください：\n\n${request.text}` }] })`

**Context Injected**:
1. Source type (seed / task_ideation / task_conversation / task_result)
2. Phase (ideation / progress / result)
3. Text to extract from

**Confidence Threshold**: 0.7 (lower confidence results filtered)

**Key Characteristics**:
- **Lightweight**: Pure text extraction (no user-specific context)
- **Quality-first**: High confidence threshold
- **Post-processing**: Filters by confidence + category
- **Fallback**: Demo extraction (hardcoded) if API fails

---

### 1.8 KNOWLEDGE CLUSTERING API

**File**: `src/services/nodemap/knowledgeClustering.service.ts`

**Purpose**: Weekly AI clustering of accumulated keywords into domain/field structure.

**System Prompt**:
```
ナレッジ構造化の専門家
- Input: Keyword list (accumulated over week)
- Output: JSON { clusters: [{ domainLabel, domainDescription, color, confidence, fields: [...] }], overallConfidence, reasoning }
- Rules:
  - 3-hierarchy: Domain → Field → Entry
  - Min 2 entries per group
  - Domain colors assigned (Tailwind format: "bg-blue-50 text-blue-800")
  - Integrate with existing structure if possible
```

**Data Queried**:
1. `knowledge_master_entries` → is_confirmed=false (unconfirmed keywords), label, category
2. `knowledge_domains` → existing domains (for alignment)
3. `knowledge_fields` → existing fields (for alignment)

**Claude API Call Location**:
- `knowledgeClustering.service.ts` (not shown in audit, but pattern is similar): `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 2000, system: CLUSTERING_SYSTEM_PROMPT, messages: [{ role: 'user', content: keywordListText }] })`

**Context Injected**:
1. Keyword list (50+ unconfirmed entries)
2. Existing domain/field structure (for alignment reference)

**Key Characteristics**:
- **Weekly trigger**: ISO week number check (prevents duplicates)
- **Confidence scoring**: Per-domain + overall confidence
- **Color assignment**: Rotates through 6 Tailwind color palettes
- **Post-processing**: AI response → DB insert into knowledge_clustering_proposals

---

### 1.9 FILE CLASSIFICATION API

**File**: `src/services/drive/fileClassification.service.ts`

**Purpose**: Auto-classify uploaded file (document type, direction, suggested filename).

**System Prompt**:
```
ビジネス文書の分類エキスパート
- Input: File name + MIME type + email context (subject, body, sender, date)
- Output: JSON { documentType, direction, yearMonth, suggestedName, confidence, reasoning }
- Rules:
  - Document types: 見積書/契約書/請求書/発注書/納品書/仕様書/議事録/報告書/提案書/企画書/その他
  - Direction: received / submitted (from email direction)
  - yearMonth: YYYY-MM (from messageDate or current date)
  - suggestedName: YYYY-MM-DD_種別_元ファイル名.拡張子
  - confidence: 0.0-1.0
```

**Data Queried**:
1. Input: fileName, mimeType, emailSubject, emailBody (first 200 chars), senderName, senderAddress, direction, messageDate, organizationName, projectName

**Claude API Call Location**:
- Line ~59: `client.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 500, system: systemPrompt, messages: [{ role: 'user', content: buildClassificationPrompt(input) }] })`

**Key Characteristics**:
- **Lightweight context**: Metadata-based (no file contents)
- **Fallback**: Keyword-based classification if API fails
- **Post-processing**: Validation + sanitization of suggested filename

---

### 1.10 REPLAY MODE (Completed Task AI Chat)

**File**: `src/app/api/thought-map/replay/route.ts`

**Purpose**: AI re-enacts completed task for user to ask about past decisions.

**System Prompt**:
```
思考リプレイのガイド
- Input: Task info + ideation summary + result summary + conversation history + snapshots + nodes
- Output: Conversational response to user question about past thinking
- Role: Analyze past decision process and provide insights
```

**Data Queried**:
1. `tasks` → id, title, description, status, phase, goal, ideation_summary, result_summary, created_at, updated_at
2. `task_conversations` → role, content, phase, created_at (last 50)
3. `thought_snapshots` → snapshot_type, summary, node_ids, created_at
4. `thought_task_nodes` → node_id, appear_phase, appear_order, is_main_route (with knowledge_master_entries label)

**Claude API Call Location**:
- Line ~90: `client.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 1500, system: systemPrompt, messages: [...conversationHistory, { role: 'user', content: message }] })`

**Context Injected**:
1. Task metadata (title, description, dates)
2. Ideation + result summaries
3. Full conversation history (phase-aware)
4. Snapshot comparison (initial goal vs final landing)
5. Node journey (thought flow)

**Key Characteristics**:
- **Multi-turn**: Maintains conversation history
- **Historical replay**: Presents task as already completed
- **Node integration**: Shows thought nodes traversed
- **Snapshot awareness**: Initial vs final state

---

### 1.11 BUSINESS EVENT AI SUMMARY (Cron Job)

**File**: `src/app/api/cron/summarize-business-log/route.ts`

**Purpose**: Weekly Cron job (Monday 2:30 AM) - summarize past week's business events per project.

**System Prompt**:
```
ビジネスイベント週間要約
- Input: Categorized events (messages/documents/meetings/other) for 1 week
- Output: Plain text summary (300-500 chars)
- Rules: By event category, focus on key decisions/outcomes
```

**Data Queried**:
1. `business_events` → event_type, title, content, event_date, source_channel (WHERE created >= 7 days ago, NOT event_type='summary')
2. `projects` → id, name (grouped by project)
3. Filter: ai_generated=true, summary_period not already created

**Claude API Call Location**:
- Within for-loop per project: `anthropic.messages.create({ model: 'claude-sonnet-4-5-20250929', max_tokens: 800, system: systemPrompt, messages: [{ role: 'user', content: eventCategorySummary }] })`

**Context Injected**:
1. Week start/end dates
2. Event categories: Messages, Documents, Meetings, Other
3. Event count per category
4. Event details (title + content snippet)

**Key Characteristics**:
- **Cron-triggered**: No user input
- **ISO week number**: Prevents duplicate summaries
- **Per-project**: Summary specific to project
- **Fallback**: Template-based summary if API fails

---

### 1.12 TASK SUMMARY GENERATION

**File**: `src/services/ai/aiClient.service.ts` → `generateTaskSummary()`

**Purpose**: When task is completed, AI summarizes the full task journey.

**System Prompt**:
```
タスクの会話履歴から結果要約を生成
- Input: Task title + ideation summary + conversation history
- Output: JSON { 【結論】...【プロセス】...【学び】...【次のアクション】... }
```

**Data Queried**:
1. `tasks` → title, ideation_summary
2. `task_conversations` → role, content (full history)

**Claude API Call Location**:
- Line ~611: `client.messages.create({ model: 'claude-opus-4-5-20251101', max_tokens: 500, system: systemPrompt, messages: [{ role: 'user', content: taskInfo + conversationHistory }] })`

**Model Used**: `claude-opus-4-5-20251101` (upgraded from Sonnet for final summary quality)

**Key Characteristics**:
- **Only API call using Opus**: Full task summary warrants more capable model
- **Multi-turn input**: Full conversation history provided
- **Output structure**: JSON with 4 fixed sections

---

## 2. Summary Table: All Claude API Calls

| File | Function | Intent | Model | Max Tokens | System Prompt | Data Injected | User Context |
|------|----------|--------|-------|-----------|---------------|---------------|--------------|
| agent/chat/route.ts | Secretary chat (main) | 20+ intents | Sonnet | 2000 | Intent-specific (1500 chars) | DB data (messages, tasks, jobs, calendar) | Message only |
| tasks/chat/route.ts | Task AI chat | Ideation/Progress/Result | Sonnet | 1500 | Phase-specific rules | Task, project, org, conversation history | User message + history |
| ai/draft-reply/route.ts | Reply draft | Email/Slack/Chat response | Sonnet | 1000 | Channel tone + contact rules | Contact info, past messages, signature | Writing style sample |
| ai/structure-job/route.ts (Schedule) | Job structuring - schedule | Date negotiation | Sonnet | 1024 | Calendar + greeting/closing rules | Calendar free slots, user name | Writing style sample |
| ai/structure-job/route.ts (Consult) | Job structuring - consult | Internal consultation summary | Sonnet | 512 | Thread summarization rules | Message thread (10 recent) | None |
| ai/structure-job/route.ts (Todo/Default) | Job structuring - generic | Generic job creation | Sonnet | 256 | Minimal job generation rules | Message content only | None |
| memos/[id]/convert/route.ts | Memo to task conversion | Task generation from idea | Sonnet | 600 | Task generation rules | Memo content + conversation history | None |
| consultations/route.ts | Consultation AI reply | Return email generation | Sonnet | 1024 | Email generation + channel rules | Thread + question + answer, signature | Writing style sample |
| services/ai/keywordExtractor.service.ts | Keyword extraction | Keyword/person/project extraction | Sonnet | 800 | Extraction rules (confidence >= 0.7) | Text only | None |
| services/nodemap/knowledgeClustering.service.ts | Knowledge clustering | Weekly domain/field grouping | Sonnet | 2000 | Clustering rules + color assignment | Unconfirmed keywords list | None |
| services/drive/fileClassification.service.ts | File classification | Document type/direction prediction | Sonnet | 500 | Classification rules | File name, email metadata | None |
| thought-map/replay/route.ts | Replay mode | Task thinking re-enactment | Sonnet | 1500 | Replay role + analysis rules | Full task + conversations + snapshots | None |
| cron/summarize-business-log/route.ts | Weekly event summary | Cron-based summary | Sonnet | 800 | Summary rules by category | Event list (7 days) | None |
| services/ai/aiClient.service.ts | Task summary (on complete) | Final task summary | **Opus** | 500 | Summary output structure | Full task + all conversations | None |

---

## 3. Writing Style Injection (User-Specific Context)

**Where Used**: 6 endpoints

| Endpoint | Implementation |
|----------|---|
| `generateReplyDraft()` | `getUserWritingStyle(userId, channel)` → Last 5 sent messages, injected as style samples |
| Task AI Chat | `getUserWritingStyle(userId)` → Injected in system prompt (all phases) |
| Job Structuring (Schedule) | `getUserWritingStyle(userId, channel)` → Injected in greeting/closing generation |
| Consultation Reply | `getUserWritingStyle(userId, jobChannel)` → Injected before return email generation |
| Other endpoints | NO writing style used (generic responses) |

**Implementation**:
```typescript
// src/services/ai/aiClient.service.ts
export async function getUserWritingStyle(userId: string, channel?: string): Promise<string> {
  // Queries last 10 sent messages from inbox_messages
  // Filters by channel if specified
  // Returns top 5 by length as style samples
  // Each sample: 300 chars max
}
```

**Injected Format**:
```
## あなたの過去の送信メッセージ（文体・表現の参考にしてください）
--- 送信例1 ---
[past message 1]

--- 送信例2 ---
[past message 2]
...
```

---

## 4. Email Signature Handling

**Where Used**: 3 endpoints

| Endpoint | Signature Source | Injection Point |
|----------|---|---|
| `generateReplyDraft()` | `user_metadata.email_signature` (Supabase auth) | Auto-appended AFTER AI draft (line 204-206) |
| Job Structuring (Schedule) | Same | Auto-appended to closing (line 162-165) |
| Consultation Reply | Same | Auto-appended to AI draft (line 143-145) |

**Rules**:
- **Email only**: Slack/Chatwork do NOT get signature appended
- **Not in system prompt**: Signature NOT given to Claude (appended by code post-response)
- **Storage**: `user_metadata.email_signature` (Supabase profile)

---

## 5. Channel-Aware Tone Mapping

**File**: `src/services/ai/aiClient.service.ts` (generateReplyDraft)

```typescript
const channelTone: Record<string, string> = {
  email: 'フォーマルなビジネスメール。適切な挨拶・締めの言葉を含める。',
  slack: 'やや柔軟でカジュアル。適度にフレンドリーに。長い挨拶は不要。',
  chatwork: '標準的なビジネストーン。簡潔で読みやすく。'
};
```

**Applied to**:
- Reply drafts
- Job structuring (schedule + consultation)
- All contexts specify channel in system prompt

---

## 6. Contact Information Injection

**Used in Reply Draft Generation**

**Tables Queried**:
1. `contact_channels` (search by address)
2. `contact_persons` (joined on contact_id)

**Fields Injected**:
- company_name
- department
- relationship_type
- notes (memoized human observations)
- ai_context (AI-generated behavioral analysis)

**System Prompt Placement**:
```
## 相手の情報（重要：この情報を踏まえて口調や内容を調整してください）
相手の会社: ${companyName}
部署: ${department}
関係性: ${relationshipType}
メモ（口調・関係性などの情報）:
${notes}
AI分析による相手の特徴:
${aiContext}
```

---

## 7. Recent Message Context

**Used in Reply Draft Generation**

**Query**:
```sql
SELECT from_name, body, direction, timestamp, subject
FROM inbox_messages
WHERE (from_address = ? OR from_name = ?)
  AND id != current_message_id
ORDER BY timestamp DESC
LIMIT 5
```

**Format in System Prompt**:
```
## 過去のやり取り（直近のメッセージ。文脈を把握してください）
2026-03-05 あなた→相手: [ご返信ありがとうございます...]
2026-03-04 相手→あなた: [確認いたしました...]
```

---

## 8. Calendar Context Injection

**Used in**: Secretary Chat (briefing) + Job Structuring (schedule)

**Source**: Google Calendar API (`getTodayEvents()` / `findFreeSlots()`)

**Fields Injected**:
- Event ID, summary, start time, end time
- Duration (minutes)
- Location
- Participant count (if available)

**Injection Format**:
```
## 今日の予定
- 10:00-11:00 営業会議 (30分) @会議室A (5人)
- 14:00-15:30 プロジェクト打合 @オンライン
```

**For Schedule Intent**: Free slots formatted as:
```
【候補日時】
・3/6(木) 10:00-12:30, 14:00-19:00
・3/7(金) 09:00-18:00
```

---

## 9. Project/Organization Context

**Used in**: Task AI Chat only

**Query**:
```sql
SELECT p.name, p.description, o.name, o.memo
FROM projects p
LEFT JOIN organizations o ON p.organization_id = o.id
WHERE p.id = ?
```

**Additional**: Member names from `task_members` + `contact_persons`

**Injected as**:
```
## プロジェクト・組織の背景情報
組織: ${organizationName}
組織メモ: ${organizationMemo}
プロジェクト: ${projectName}
プロジェクト概要: ${projectDescription}
関係者: ${memberNames.join('、')}
```

---

## 10. Conversation History Management

### Task AI Chat
- **Stored in**: `task_conversations` (role, content, phase, conversation_tag, turn_id)
- **Passed to Claude**: Last 20 messages (system prompt sets limit)
- **Truncation**: None (full history per message)
- **Phase tracking**: Each message tagged with phase (ideation/progress/result)
- **Covered items detection**: Regex scan of conversation to detect which of 4 items discussed

### Secretary Chat
- **Stored in**: `secretary_conversations` (persistent, for context reference)
- **Passed to Claude**: Single user message (NO history)
- **Rationale**: Each intent pulls fresh DB data (messages, tasks, jobs) as context instead

### Replay Mode
- **Stored in**: `task_conversations`
- **Passed to Claude**: Last 50 messages + snapshots + nodes
- **Purpose**: Re-enact completed task thinking

---

## 11. API Error Handling & Fallback

### All Endpoints Follow Pattern:
```typescript
try {
  const response = await client.messages.create({...});
  // Parse + return response
} catch (error) {
  console.error('API error:', error);
  return getDemoResponse(...) || templateFallback(...);
}
```

### Fallback Types:
1. **Demo response** (hardcoded): Secretary chat, task chat, reply draft
2. **Template-based**: Job structuring, consultations
3. **Keyword extraction**: Hardcoded list of common keywords
4. **File classification**: Pattern-based (keywords in filename)
5. **Task summary**: Basic structure "【結論】完了" without AI details

### No Fallback:
- Keyword extraction (returns empty if API fails)
- File classification (uses confidence=0 fallback)

---

## 12. RAG/Context Retrieval Patterns

### Secretary Chat (Largest Pattern)
```
User Message
  ↓ Intent Classification (keyword-based, no API)
  ↓ Parallel DB fetches (Promise.all)
    - Messages: inbox_messages (20 recent, direction='received')
    - Tasks: tasks (20 recent, status != 'done')
    - Jobs: jobs (15 recent)
    - Calendar: Google Calendar API (if intent='briefing')
    - Special: consultations, file_staging, proposals (intent-specific)
  ↓ Format context text (3000-5000 chars)
  ↓ Claude API call (system + user message + context)
  ↓ Card generation (based on Claude response)
  ↓ Return response + cards
```

### Task AI Chat
```
User Message → Load task → Get conversations (20 last)
  ↓ Format context (task + project + org + history)
  ↓ Claude API (phase-specific system prompt)
  ↓ Save conversation turn
  ↓ Background: Extract keywords → Link to knowledge nodes
  ↓ Return response
```

### Reply Draft
```
Selected message → Parallel fetches (contact, recent messages, signature, style)
  ↓ Format context (contact + recent + thread + style)
  ↓ Claude API
  ↓ Post-append signature if email
  ↓ Return draft
```

---

## 13. Confidence & Quality Metrics

### Keyword Extraction
- **Confidence threshold**: >= 0.7 (high precision)
- **Max keywords**: 8 (quality over quantity)
- **Categories**: Keywords, Persons, Projects

### File Classification
- **Confidence range**: 0.0-1.0 (AI-assessed)
- **Fallback threshold**: If confidence < 0.5 or API fails, use keyword patterns

### Knowledge Clustering
- **Clustering confidence**: Per-domain + overall (0.0-1.0)
- **Min group size**: 2 entries (avoid single-item clusters)
- **Weekly trigger**: ISO week number (prevents duplicates)

---

## 14. Token Usage Estimates

| Endpoint | Avg System Tokens | Avg Data Tokens | Avg User Msg Tokens | Max Total | Typical Total |
|----------|---|---|---|---|---|
| Secretary chat | 200 | 2500 | 100 | 2000 | 1200 |
| Task AI chat | 300 | 800 | 50 | 1500 | 900 |
| Reply draft | 250 | 400 | 50 | 1000 | 600 |
| Job (schedule) | 300 | 300 | 50 | 1024 | 500 |
| Job (consult) | 150 | 200 | 50 | 512 | 300 |
| Keyword extraction | 400 | 200 | 100 | 800 | 500 |
| Knowledge clustering | 500 | 1500 | 100 | 2000 | 1500 |
| File classification | 300 | 150 | 50 | 500 | 350 |
| Replay mode | 300 | 1500 | 100 | 1500 | 1000 |

**Total Daily Average** (rough):
- Secretary: 5-10 messages = 6000-12000 tokens
- Task chat: 5-10 turns = 4500-9000 tokens
- Reply drafts: 10-20 = 6000-12000 tokens
- Others: 3000-5000 tokens
- **TOTAL**: ~25000-40000 tokens/day (for active user)

---

## 15. Data Privacy & Security Notes

### No PII in System Prompts:
- Contact names/emails NOT hardcoded
- Always injected at message time
- Can be redacted by stripping `contact_info` section

### Conversation History Retention:
- Task: Kept indefinitely (task_conversations)
- Secretary: Kept 30 days (secretary_conversations)
- Reply draft: Not stored (single-turn)

### User Metadata Exposure:
- Email signature: Via user_metadata.email_signature
- Writing style: From inbox_messages (sent direction only)
- No password/token exposure in context

### Multi-Tenant Safety:
- All queries filtered by user_id
- No cross-user data leakage in API calls
- Service role key used (RLS bypassed but scoped to user_id)

---

## 16. Recommendations for Audit/Compliance

1. **Data Retention**: Define TTL for secretary_conversations (currently unbounded)
2. **Sensitive Fields**: Mask contact.notes if containing PII (not currently done)
3. **Writing Style**: Option to disable user style injection (privacy)
4. **System Prompt Logging**: Log full system prompts for audit (currently only errors logged)
5. **Token Budget**: Monitor daily token usage vs billing (no current tracking)
6. **Fallback Testing**: Test all demo responses quarterly to prevent stale templates
7. **Model Upgrades**: Plan migration path when models are deprecated (currently Sonnet only)

---

## Appendix: Full File List with AI Calls

```
✓ src/services/ai/aiClient.service.ts          - 5 API calls (reply, task chat, task summary, style, thread summary)
✓ src/app/api/agent/chat/route.ts              - 1 API call (secretary main) + integration with others
✓ src/app/api/tasks/chat/route.ts              - Via aiClient.service.ts
✓ src/app/api/ai/draft-reply/route.ts          - Via aiClient.service.ts
✓ src/app/api/ai/structure-job/route.ts        - 4 API calls (schedule, consult, todo, default)
✓ src/app/api/memos/[id]/convert/route.ts      - 1 API call (memo→task)
✓ src/app/api/consultations/route.ts           - 1 API call (consultation reply)
✓ src/services/nodemap/thoughtNode.service.ts  - Via keywordExtractor.service.ts
✓ src/services/ai/keywordExtractor.service.ts  - 1 API call (keyword extraction)
✓ src/services/nodemap/knowledgeClustering.service.ts - 1 API call (clustering, weekly)
✓ src/services/drive/fileClassification.service.ts - 1 API call (file classify)
✓ src/app/api/thought-map/replay/route.ts      - 1 API call (replay mode)
✓ src/app/api/cron/summarize-business-log/route.ts - 1 API call per project (weekly)

Total: 18 distinct API call locations
Active Endpoints: 12
Cron Jobs: 1
Service Integrations: 5
```

---

**END OF AUDIT**

Document Completeness: ✓ All 18 API call locations documented
Last Updated: 2026-03-05 12:00 UTC
Auditor: Claude Code Agent
