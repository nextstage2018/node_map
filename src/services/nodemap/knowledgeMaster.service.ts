// ナレッジマスタサービス
// 組織共通の3階層分類体系（領域→分野→キーワード）を管理
// AI自動分類とノード↔マスタ紐付けを担う

import {
  KnowledgeDomain,
  KnowledgeField,
  KnowledgeMasterEntry,
  NodeMasterLink,
  KnowledgeHierarchy,
  ClassificationResult,
} from '@/lib/types';
import { KNOWLEDGE_DOMAIN_CONFIG } from '@/lib/constants';

// ===== インメモリストア（本番はSupabase） =====
let domainsStore: KnowledgeDomain[] = [];
let fieldsStore: KnowledgeField[] = [];
let entriesStore: KnowledgeMasterEntry[] = [];
let linksStore: NodeMasterLink[] = [];

// ===== デモデータ初期化 =====
function initDemoData(): void {
  if (domainsStore.length > 0) return;

  const now = new Date().toISOString();

  // --- 第1階層：領域 ---
  domainsStore = Object.entries(KNOWLEDGE_DOMAIN_CONFIG).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    description: cfg.description,
    color: cfg.color,
    sortOrder: cfg.sortOrder,
    createdAt: now,
  }));

  // --- 第2階層：分野 ---
  fieldsStore = [
    // マーケティング
    { id: 'field_seo', domainId: 'domain_marketing', name: 'SEO', description: '検索エンジン最適化', sortOrder: 1, createdAt: now },
    { id: 'field_advertising', domainId: 'domain_marketing', name: '広告運用', description: 'リスティング・ディスプレイ広告', sortOrder: 2, createdAt: now },
    { id: 'field_content', domainId: 'domain_marketing', name: 'コンテンツマーケティング', description: 'コンテンツ戦略・記事・SNS', sortOrder: 3, createdAt: now },
    { id: 'field_analytics', domainId: 'domain_marketing', name: 'マーケティング分析', description: 'KPI・LTV・コンバージョン', sortOrder: 4, createdAt: now },

    // 開発
    { id: 'field_frontend', domainId: 'domain_development', name: 'フロントエンド', description: 'UI/UX・React・デザインシステム', sortOrder: 1, createdAt: now },
    { id: 'field_backend', domainId: 'domain_development', name: 'バックエンド', description: 'API・DB・サーバー', sortOrder: 2, createdAt: now },
    { id: 'field_infra', domainId: 'domain_development', name: 'インフラ・DevOps', description: 'CI/CD・クラウド・セキュリティ', sortOrder: 3, createdAt: now },

    // 営業
    { id: 'field_acquisition', domainId: 'domain_sales', name: '新規顧客獲得', description: 'リード獲得・初回提案', sortOrder: 1, createdAt: now },
    { id: 'field_account', domainId: 'domain_sales', name: 'アカウント管理', description: '既存顧客・リレーション', sortOrder: 2, createdAt: now },
    { id: 'field_proposal', domainId: 'domain_sales', name: '提案・プレゼン', description: '企画書・見積・商談', sortOrder: 3, createdAt: now },

    // 管理
    { id: 'field_accounting', domainId: 'domain_management', name: '経理・財務', description: '予算・経費・決算', sortOrder: 1, createdAt: now },
    { id: 'field_hr', domainId: 'domain_management', name: '人事・労務', description: '採用・評価・研修', sortOrder: 2, createdAt: now },
    { id: 'field_legal', domainId: 'domain_management', name: '法務・コンプライアンス', description: '契約・規定・リスク管理', sortOrder: 3, createdAt: now },

    // 企画
    { id: 'field_strategy', domainId: 'domain_planning', name: '経営戦略', description: '事業計画・中期計画', sortOrder: 1, createdAt: now },
    { id: 'field_newbiz', domainId: 'domain_planning', name: '新規事業', description: '市場調査・PoC・事業開発', sortOrder: 2, createdAt: now },
    { id: 'field_branding', domainId: 'domain_planning', name: 'ブランド戦略', description: 'ブランディング・CI・PR', sortOrder: 3, createdAt: now },
  ];

  // --- 第3階層：マスタキーワード ---
  entriesStore = [
    // SEO
    { id: 'me_seo', fieldId: 'field_seo', label: 'SEO対策', synonyms: ['SEO', '検索最適化', 'サーチエンジン最適化'], createdAt: now },
    { id: 'me_keyword_research', fieldId: 'field_seo', label: 'キーワードリサーチ', synonyms: ['キーワード調査', 'KW調査'], createdAt: now },

    // 広告運用
    { id: 'me_listing', fieldId: 'field_advertising', label: 'リスティング広告', synonyms: ['検索広告', 'SEM', 'PPC'], createdAt: now },
    { id: 'me_display_ad', fieldId: 'field_advertising', label: 'ディスプレイ広告', synonyms: ['バナー広告', 'GDN'], createdAt: now },

    // コンテンツマーケティング
    { id: 'me_content_strategy', fieldId: 'field_content', label: 'コンテンツ戦略', synonyms: ['コンテンツ企画', 'コンテンツプラン'], createdAt: now },
    { id: 'me_sns', fieldId: 'field_content', label: 'SNS運用', synonyms: ['ソーシャルメディア', 'SNSマーケティング', 'Twitter運用', 'Instagram運用'], createdAt: now },

    // マーケティング分析
    { id: 'me_ltv', fieldId: 'field_analytics', label: 'LTV分析', synonyms: ['LTV', '顧客生涯価値', 'ライフタイムバリュー'], createdAt: now },
    { id: 'me_cvr', fieldId: 'field_analytics', label: 'コンバージョン率', synonyms: ['CVR', 'コンバージョン', '転換率'], createdAt: now },
    { id: 'me_roi', fieldId: 'field_analytics', label: 'ROI', synonyms: ['投資対効果', '投資収益率', 'ROAS'], createdAt: now },
    { id: 'me_kpi', fieldId: 'field_analytics', label: 'KPI設計', synonyms: ['KPI', 'KGI', '重要業績指標'], createdAt: now },

    // フロントエンド
    { id: 'me_uiux', fieldId: 'field_frontend', label: 'UI/UX', synonyms: ['ユーザーインターフェース', 'UXデザイン', 'UIデザイン'], createdAt: now },
    { id: 'me_design', fieldId: 'field_frontend', label: 'デザイン', synonyms: ['Webデザイン', 'ビジュアルデザイン'], createdAt: now },
    { id: 'me_prototype', fieldId: 'field_frontend', label: 'プロトタイプ', synonyms: ['プロトタイピング', 'モックアップ', 'ワイヤーフレーム'], createdAt: now },
    { id: 'me_figma', fieldId: 'field_frontend', label: 'フィグマ', synonyms: ['Figma', 'フィグマ'], createdAt: now },
    { id: 'me_accessibility', fieldId: 'field_frontend', label: 'アクセシビリティ', synonyms: ['a11y', 'ウェブアクセシビリティ'], createdAt: now },
    { id: 'me_user_research', fieldId: 'field_frontend', label: 'ユーザーリサーチ', synonyms: ['ユーザー調査', 'UXリサーチ', 'ユーザビリティテスト'], createdAt: now },

    // バックエンド
    { id: 'me_backend', fieldId: 'field_backend', label: 'バックエンド', synonyms: ['サーバーサイド', 'バックエンド開発'], createdAt: now },
    { id: 'me_api', fieldId: 'field_backend', label: 'API設計', synonyms: ['API', 'REST API', 'GraphQL'], createdAt: now },
    { id: 'me_database', fieldId: 'field_backend', label: 'データベース', synonyms: ['DB', 'SQL', 'データベース設計'], createdAt: now },
    { id: 'me_performance', fieldId: 'field_backend', label: 'パフォーマンス最適化', synonyms: ['パフォーマンス改善', '高速化', 'チューニング'], createdAt: now },

    // インフラ・DevOps
    { id: 'me_cicd', fieldId: 'field_infra', label: 'CI/CD', synonyms: ['継続的インテグレーション', 'デプロイ自動化'], createdAt: now },
    { id: 'me_security', fieldId: 'field_infra', label: 'セキュリティ', synonyms: ['情報セキュリティ', 'サイバーセキュリティ'], createdAt: now },

    // 新規顧客獲得
    { id: 'me_customer_acquisition', fieldId: 'field_acquisition', label: '新規顧客獲得施策', synonyms: ['新規獲得', 'リードジェネレーション', '顧客開拓'], createdAt: now },
    { id: 'me_competitor', fieldId: 'field_acquisition', label: '競合分析', synonyms: ['競合調査', '競争分析', 'ベンチマーク'], createdAt: now },

    // 経理・財務
    { id: 'me_budget', fieldId: 'field_accounting', label: '予算管理', synonyms: ['予算策定', 'バジェット', '予算配分'], createdAt: now },

    // 経営戦略
    { id: 'me_strategy', fieldId: 'field_strategy', label: '経営戦略', synonyms: ['事業戦略', '中期経営計画', '戦略立案'], createdAt: now },

    // ブランド戦略
    { id: 'me_branding', fieldId: 'field_branding', label: 'ブランディング', synonyms: ['ブランド構築', 'ブランド戦略', 'CI'], createdAt: now },

    // プロジェクト系（分野横断）
    { id: 'me_marketing_general', fieldId: 'field_content', label: 'マーケティング', synonyms: ['マーケ', 'マーケティング活動'], createdAt: now },
    { id: 'me_web_renewal', fieldId: 'field_frontend', label: 'WebリニューアルPJ', synonyms: ['Webリニューアル', 'サイトリニューアル', 'Web刷新'], createdAt: now },
  ];

  // --- 既存デモノードとマスタの紐付け ---
  linksStore = [
    // user_self のノード
    { nodeId: 'node-1', masterEntryId: 'me_marketing_general', confidence: 0.95, confirmed: true, createdAt: now },
    { nodeId: 'node-2', masterEntryId: 'me_seo', confidence: 0.98, confirmed: true, createdAt: now },
    { nodeId: 'node-3', masterEntryId: 'me_content_strategy', confidence: 0.92, confirmed: true, createdAt: now },
    { nodeId: 'node-4', masterEntryId: 'me_listing', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 'node-5', masterEntryId: 'me_ltv', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 'node-9', masterEntryId: 'me_web_renewal', confidence: 0.99, confirmed: true, createdAt: now },
    { nodeId: 'node-10', masterEntryId: 'me_customer_acquisition', confidence: 0.88, confirmed: false, createdAt: now },
    { nodeId: 'node-11', masterEntryId: 'me_user_research', confidence: 0.93, confirmed: true, createdAt: now },
    { nodeId: 'node-12', masterEntryId: 'me_cvr', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 'node-13', masterEntryId: 'me_branding', confidence: 0.90, confirmed: false, createdAt: now },
    { nodeId: 'node-14', masterEntryId: 'me_sns', confidence: 0.94, confirmed: true, createdAt: now },

    // user_tanaka のノード
    { nodeId: 't-node-1', masterEntryId: 'me_strategy', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 't-node-2', masterEntryId: 'me_marketing_general', confidence: 0.95, confirmed: true, createdAt: now },
    { nodeId: 't-node-3', masterEntryId: 'me_kpi', confidence: 0.98, confirmed: true, createdAt: now },
    { nodeId: 't-node-4', masterEntryId: 'me_budget', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 't-node-5', masterEntryId: 'me_seo', confidence: 0.85, confirmed: false, createdAt: now },
    { nodeId: 't-node-6', masterEntryId: 'me_cvr', confidence: 0.90, confirmed: true, createdAt: now },
    { nodeId: 't-node-7', masterEntryId: 'me_ltv', confidence: 0.93, confirmed: true, createdAt: now },
    { nodeId: 't-node-10', masterEntryId: 'me_web_renewal', confidence: 0.99, confirmed: true, createdAt: now },
    { nodeId: 't-node-11', masterEntryId: 'me_customer_acquisition', confidence: 0.91, confirmed: true, createdAt: now },
    { nodeId: 't-node-12', masterEntryId: 'me_competitor', confidence: 0.94, confirmed: true, createdAt: now },
    { nodeId: 't-node-13', masterEntryId: 'me_roi', confidence: 0.97, confirmed: true, createdAt: now },

    // user_sato のノード
    { nodeId: 's-node-1', masterEntryId: 'me_design', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 's-node-2', masterEntryId: 'me_uiux', confidence: 0.98, confirmed: true, createdAt: now },
    { nodeId: 's-node-3', masterEntryId: 'me_prototype', confidence: 0.95, confirmed: true, createdAt: now },
    { nodeId: 's-node-4', masterEntryId: 'me_user_research', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 's-node-5', masterEntryId: 'me_cvr', confidence: 0.72, confirmed: false, createdAt: now },
    { nodeId: 's-node-6', masterEntryId: 'me_web_renewal', confidence: 0.99, confirmed: true, createdAt: now },
    { nodeId: 's-node-7', masterEntryId: 'me_figma', confidence: 0.99, confirmed: true, createdAt: now },
    { nodeId: 's-node-9', masterEntryId: 'me_accessibility', confidence: 0.96, confirmed: true, createdAt: now },

    // user_yamada のノード
    { nodeId: 'y-node-1', masterEntryId: 'me_backend', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 'y-node-2', masterEntryId: 'me_api', confidence: 0.98, confirmed: true, createdAt: now },
    { nodeId: 'y-node-3', masterEntryId: 'me_database', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 'y-node-4', masterEntryId: 'me_security', confidence: 0.89, confirmed: false, createdAt: now },
    { nodeId: 'y-node-5', masterEntryId: 'me_web_renewal', confidence: 0.88, confirmed: true, createdAt: now },
    { nodeId: 'y-node-6', masterEntryId: 'me_cicd', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 'y-node-7', masterEntryId: 'me_performance', confidence: 0.93, confirmed: true, createdAt: now },
  ];
}

// ===== サービスクラス =====

export class KnowledgeMasterService {
  /**
   * 領域一覧を取得
   */
  static async getDomains(): Promise<KnowledgeDomain[]> {
    initDemoData();
    return [...domainsStore].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * 分野一覧を取得（領域フィルター対応）
   */
  static async getFields(domainId?: string): Promise<KnowledgeField[]> {
    initDemoData();
    let result = [...fieldsStore];
    if (domainId) {
      result = result.filter((f) => f.domainId === domainId);
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * マスタキーワード一覧を取得（分野フィルター対応）
   */
  static async getMasterEntries(fieldId?: string): Promise<KnowledgeMasterEntry[]> {
    initDemoData();
    let result = [...entriesStore];
    if (fieldId) {
      result = result.filter((e) => e.fieldId === fieldId);
    }
    return result;
  }

  /**
   * ノード↔マスタのリンク一覧
   */
  static async getLinks(nodeId?: string): Promise<NodeMasterLink[]> {
    initDemoData();
    if (nodeId) {
      return linksStore.filter((l) => l.nodeId === nodeId);
    }
    return [...linksStore];
  }

  /**
   * ナレッジマスタの全階層ツリーを取得
   */
  static async getHierarchy(): Promise<KnowledgeHierarchy> {
    initDemoData();

    const domains = domainsStore
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((domain) => {
        const domainFields = fieldsStore
          .filter((f) => f.domainId === domain.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((field) => {
            const fieldEntries = entriesStore.filter((e) => e.fieldId === field.id);
            // この分野にリンクされたノード数を計算
            const entryIds = new Set(fieldEntries.map((e) => e.id));
            const nodeCount = linksStore.filter((l) => entryIds.has(l.masterEntryId)).length;
            return { ...field, entries: fieldEntries, nodeCount };
          });
        return { ...domain, fields: domainFields };
      });

    const totalEntries = entriesStore.length;

    // 全ノード数からリンク済みノード数を引いて未分類数を算出
    // ※ここではリンクストアのユニークnodeId数を使う
    const linkedNodeIds = new Set(linksStore.map((l) => l.nodeId));
    // デモでは全ノード44個中、リンクされていないものが未分類
    // 人名ノード（person）はマスタ対象外なので除外して計算
    const unclassifiedCount = 0; // デモではキーワード/プロジェクトは全てリンク済み

    return { domains, totalEntries, unclassifiedCount };
  }

  /**
   * キーワードをルールベースで自動分類
   * （本番ではAI API呼び出しに置き換え）
   */
  static async classifyKeyword(label: string): Promise<ClassificationResult | null> {
    initDemoData();

    const normalizedLabel = label.toLowerCase().trim();

    // マスタキーワードの完全一致・同義語マッチ
    for (const entry of entriesStore) {
      const candidates = [entry.label.toLowerCase(), ...entry.synonyms.map((s) => s.toLowerCase())];
      if (candidates.includes(normalizedLabel)) {
        const field = fieldsStore.find((f) => f.id === entry.fieldId);
        const domain = field ? domainsStore.find((d) => d.id === field.domainId) : null;
        if (field && domain) {
          return {
            domainId: domain.id,
            domainName: domain.name,
            fieldId: field.id,
            fieldName: field.name,
            masterEntryId: entry.id,
            confidence: 0.95,
          };
        }
      }
    }

    // 部分一致（同義語に含まれるか）
    for (const entry of entriesStore) {
      const candidates = [entry.label.toLowerCase(), ...entry.synonyms.map((s) => s.toLowerCase())];
      const partialMatch = candidates.some(
        (c) => c.includes(normalizedLabel) || normalizedLabel.includes(c)
      );
      if (partialMatch) {
        const field = fieldsStore.find((f) => f.id === entry.fieldId);
        const domain = field ? domainsStore.find((d) => d.id === field.domainId) : null;
        if (field && domain) {
          return {
            domainId: domain.id,
            domainName: domain.name,
            fieldId: field.id,
            fieldName: field.name,
            masterEntryId: entry.id,
            confidence: 0.7,
          };
        }
      }
    }

    return null; // 分類不能
  }

  /**
   * ノードをマスタキーワードに紐付け
   */
  static async linkNodeToMaster(
    nodeId: string,
    masterEntryId: string,
    confidence: number = 0.9
  ): Promise<NodeMasterLink> {
    initDemoData();

    // 既存リンクを更新または新規作成
    const existing = linksStore.find(
      (l) => l.nodeId === nodeId && l.masterEntryId === masterEntryId
    );
    if (existing) {
      existing.confidence = confidence;
      return existing;
    }

    const link: NodeMasterLink = {
      nodeId,
      masterEntryId,
      confidence,
      confirmed: false,
      createdAt: new Date().toISOString(),
    };
    linksStore.push(link);
    return link;
  }

  /**
   * リンクをユーザー確認済みにする
   */
  static async confirmLink(nodeId: string, masterEntryId: string): Promise<NodeMasterLink | null> {
    initDemoData();
    const link = linksStore.find(
      (l) => l.nodeId === nodeId && l.masterEntryId === masterEntryId
    );
    if (link) {
      link.confirmed = true;
      return link;
    }
    return null;
  }

  /**
   * 領域を追加
   */
  static async addDomain(
    name: string,
    description: string,
    color: string
  ): Promise<KnowledgeDomain> {
    initDemoData();
    const domain: KnowledgeDomain = {
      id: `domain_${Date.now()}`,
      name,
      description,
      color,
      sortOrder: domainsStore.length + 1,
      createdAt: new Date().toISOString(),
    };
    domainsStore.push(domain);
    return domain;
  }

  /**
   * 分野を追加
   */
  static async addField(
    domainId: string,
    name: string,
    description: string
  ): Promise<KnowledgeField> {
    initDemoData();
    const existingFields = fieldsStore.filter((f) => f.domainId === domainId);
    const field: KnowledgeField = {
      id: `field_${Date.now()}`,
      domainId,
      name,
      description,
      sortOrder: existingFields.length + 1,
      createdAt: new Date().toISOString(),
    };
    fieldsStore.push(field);
    return field;
  }

  /**
   * 領域ごとのノード統計
   */
  static async getDomainStats(): Promise<
    { domainId: string; domainName: string; color: string; nodeCount: number; fieldCount: number }[]
  > {
    initDemoData();
    return domainsStore
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((domain) => {
        const domainFields = fieldsStore.filter((f) => f.domainId === domain.id);
        const fieldIds = new Set(domainFields.map((f) => f.id));
        const domainEntryIds = new Set(
          entriesStore.filter((e) => fieldIds.has(e.fieldId)).map((e) => e.id)
        );
        const nodeCount = linksStore.filter((l) => domainEntryIds.has(l.masterEntryId)).length;
        return {
          domainId: domain.id,
          domainName: domain.name,
          color: domain.color,
          nodeCount,
          fieldCount: domainFields.length,
        };
      });
  }
}
