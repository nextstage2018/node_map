// ãã¬ãã¸ãã¹ã¿ãµã¼ãã¹
// çµç¹å±éã®3éå±¤åé¡ä½ç³»ï¼é åâåéâã­ã¼ã¯ã¼ãï¼ãç®¡ç
// AIèªååé¡ã¨ãã¼ãâãã¹ã¿ç´ä»ããæã

import {
  KnowledgeDomain,
  KnowledgeField,
  KnowledgeMasterEntry,
  NodeMasterLink,
  KnowledgeHierarchy,
  ClassificationResult,
} from '@/lib/types';
import { KNOWLEDGE_DOMAIN_CONFIG } from '@/lib/constants';
import { getSupabase } from '@/lib/supabase';

// ===== ã¤ã³ã¡ã¢ãªã¹ãã¢ï¼æ¬çªã¯Supabaseï¼ =====
let domainsStore: KnowledgeDomain[] = [];
let fieldsStore: KnowledgeField[] = [];
let entriesStore: KnowledgeMasterEntry[] = [];
let linksStore: NodeMasterLink[] = [];

// ===== ãã¢ãã¼ã¿åæå =====
function initDemoData(): void {
  if (domainsStore.length > 0) return;

  const now = new Date().toISOString();

  // --- ç¬¬1éå±¤ï¼é å ---
  domainsStore = Object.entries(KNOWLEDGE_DOMAIN_CONFIG).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    description: cfg.description,
    color: cfg.color,
    sortOrder: cfg.sortOrder,
    createdAt: now,
  }));

  // --- ç¬¬2éå±¤ï¼åé ---
  fieldsStore = [
    // ãã¼ã±ãã£ã³ã°
    { id: 'field_seo', domainId: 'domain_marketing', name: 'SEO', description: 'æ¤ç´¢ã¨ã³ã¸ã³æé©å', sortOrder: 1, createdAt: now },
    { id: 'field_advertising', domainId: 'domain_marketing', name: 'åºåéç¨', description: 'ãªã¹ãã£ã³ã°ã»ãã£ã¹ãã¬ã¤åºå', sortOrder: 2, createdAt: now },
    { id: 'field_content', domainId: 'domain_marketing', name: 'ã³ã³ãã³ããã¼ã±ãã£ã³ã°', description: 'ã³ã³ãã³ãæ¦ç¥ã»è¨äºã»SNS', sortOrder: 3, createdAt: now },
    { id: 'field_analytics', domainId: 'domain_marketing', name: 'ãã¼ã±ãã£ã³ã°åæ', description: 'KPIã»LTVã»ã³ã³ãã¼ã¸ã§ã³', sortOrder: 4, createdAt: now },

    // éçº
    { id: 'field_frontend', domainId: 'domain_development', name: 'ãã­ã³ãã¨ã³ã', description: 'UI/UXã»Reactã»ãã¶ã¤ã³ã·ã¹ãã ', sortOrder: 1, createdAt: now },
    { id: 'field_backend', domainId: 'domain_development', name: 'ããã¯ã¨ã³ã', description: 'APIã»DBã»ãµã¼ãã¼', sortOrder: 2, createdAt: now },
    { id: 'field_infra', domainId: 'domain_development', name: 'ã¤ã³ãã©ã»DevOps', description: 'CI/CDã»ã¯ã©ã¦ãã»ã»ã­ã¥ãªãã£', sortOrder: 3, createdAt: now },

    // å¶æ¥­
    { id: 'field_acquisition', domainId: 'domain_sales', name: 'æ°è¦é¡§å®¢ç²å¾', description: 'ãªã¼ãç²å¾ã»ååææ¡', sortOrder: 1, createdAt: now },
    { id: 'field_account', domainId: 'domain_sales', name: 'ã¢ã«ã¦ã³ãç®¡ç', description: 'æ¢å­é¡§å®¢ã»ãªã¬ã¼ã·ã§ã³', sortOrder: 2, createdAt: now },
    { id: 'field_proposal', domainId: 'domain_sales', name: 'ææ¡ã»ãã¬ã¼ã³', description: 'ä¼ç»æ¸ã»è¦ç©ã»åè«', sortOrder: 3, createdAt: now },

    // ç®¡ç
    { id: 'field_accounting', domainId: 'domain_management', name: 'çµçã»è²¡å', description: 'äºç®ã»çµè²»ã»æ±ºç®', sortOrder: 1, createdAt: now },
    { id: 'field_hr', domainId: 'domain_management', name: 'äººäºã»å´å', description: 'æ¡ç¨ã»è©ä¾¡ã»ç ä¿®', sortOrder: 2, createdAt: now },
    { id: 'field_legal', domainId: 'domain_management', name: 'æ³åã»ã³ã³ãã©ã¤ã¢ã³ã¹', description: 'å¥ç´ã»è¦å®ã»ãªã¹ã¯ç®¡ç', sortOrder: 3, createdAt: now },

    // ä¼ç»
    { id: 'field_strategy', domainId: 'domain_planning', name: 'çµå¶æ¦ç¥', description: 'äºæ¥­è¨ç»ã»ä¸­æè¨ç»', sortOrder: 1, createdAt: now },
    { id: 'field_newbiz', domainId: 'domain_planning', name: 'æ°è¦äºæ¥­', description: 'å¸å ´èª¿æ»ã»PoCã»äºæ¥­éçº', sortOrder: 2, createdAt: now },
    { id: 'field_branding', domainId: 'domain_planning', name: 'ãã©ã³ãæ¦ç¥', description: 'ãã©ã³ãã£ã³ã°ã»CIã»PR', sortOrder: 3, createdAt: now },
  ];

  // --- ç¬¬3éå±¤ï¼ãã¹ã¿ã­ã¼ã¯ã¼ã ---
  entriesStore = [
    // SEO
    { id: 'me_seo', fieldId: 'field_seo', label: 'SEOå¯¾ç­', synonyms: ['SEO', 'æ¤ç´¢æé©å', 'ãµã¼ãã¨ã³ã¸ã³æé©å'], createdAt: now },
    { id: 'me_keyword_research', fieldId: 'field_seo', label: 'ã­ã¼ã¯ã¼ããªãµã¼ã', synonyms: ['ã­ã¼ã¯ã¼ãèª¿æ»', 'KWèª¿æ»'], createdAt: now },

    // åºåéç¨
    { id: 'me_listing', fieldId: 'field_advertising', label: 'ãªã¹ãã£ã³ã°åºå', synonyms: ['æ¤ç´¢åºå', 'SEM', 'PPC'], createdAt: now },
    { id: 'me_display_ad', fieldId: 'field_advertising', label: 'ãã£ã¹ãã¬ã¤åºå', synonyms: ['ããã¼åºå', 'GDN'], createdAt: now },

    // ã³ã³ãã³ããã¼ã±ãã£ã³ã°
    { id: 'me_content_strategy', fieldId: 'field_content', label: 'ã³ã³ãã³ãæ¦ç¥', synonyms: ['ã³ã³ãã³ãä¼ç»', 'ã³ã³ãã³ããã©ã³'], createdAt: now },
    { id: 'me_sns', fieldId: 'field_content', label: 'SNSéç¨', synonyms: ['ã½ã¼ã·ã£ã«ã¡ãã£ã¢', 'SNSãã¼ã±ãã£ã³ã°', 'Twitteréç¨', 'Instagraméç¨'], createdAt: now },

    // ãã¼ã±ãã£ã³ã°åæ
    { id: 'me_ltv', fieldId: 'field_analytics', label: 'LTVåæ', synonyms: ['LTV', 'é¡§å®¢çæ¶¯ä¾¡å¤', 'ã©ã¤ãã¿ã¤ã ããªã¥ã¼'], createdAt: now },
    { id: 'me_cvr', fieldId: 'field_analytics', label: 'ã³ã³ãã¼ã¸ã§ã³ç', synonyms: ['CVR', 'ã³ã³ãã¼ã¸ã§ã³', 'è»¢æç'], createdAt: now },
    { id: 'me_roi', fieldId: 'field_analytics', label: 'ROI', synonyms: ['æè³å¯¾å¹æ', 'æè³åçç', 'ROAS'], createdAt: now },
    { id: 'me_kpi', fieldId: 'field_analytics', label: 'KPIè¨­è¨', synonyms: ['KPI', 'KGI', 'éè¦æ¥­ç¸¾ææ¨'], createdAt: now },

    // ãã­ã³ãã¨ã³ã
    { id: 'me_uiux', fieldId: 'field_frontend', label: 'UI/UX', synonyms: ['ã¦ã¼ã¶ã¼ã¤ã³ã¿ã¼ãã§ã¼ã¹', 'UXãã¶ã¤ã³', 'UIãã¶ã¤ã³'], createdAt: now },
    { id: 'me_design', fieldId: 'field_frontend', label: 'ãã¶ã¤ã³', synonyms: ['Webãã¶ã¤ã³', 'ãã¸ã¥ã¢ã«ãã¶ã¤ã³'], createdAt: now },
    { id: 'me_prototype', fieldId: 'field_frontend', label: 'ãã­ãã¿ã¤ã', synonyms: ['ãã­ãã¿ã¤ãã³ã°', 'ã¢ãã¯ã¢ãã', 'ã¯ã¤ã¤ã¼ãã¬ã¼ã '], createdAt: now },
    { id: 'me_figma', fieldId: 'field_frontend', label: 'ãã£ã°ã', synonyms: ['Figma', 'ãã£ã°ã'], createdAt: now },
    { id: 'me_accessibility', fieldId: 'field_frontend', label: 'ã¢ã¯ã»ã·ããªãã£', synonyms: ['a11y', 'ã¦ã§ãã¢ã¯ã»ã·ããªãã£'], createdAt: now },
    { id: 'me_user_research', fieldId: 'field_frontend', label: 'ã¦ã¼ã¶ã¼ãªãµã¼ã', synonyms: ['ã¦ã¼ã¶ã¼èª¿æ»', 'UXãªãµã¼ã', 'ã¦ã¼ã¶ããªãã£ãã¹ã'], createdAt: now },

    // ããã¯ã¨ã³ã
    { id: 'me_backend', fieldId: 'field_backend', label: 'ããã¯ã¨ã³ã', synonyms: ['ãµã¼ãã¼ãµã¤ã', 'ããã¯ã¨ã³ãéçº'], createdAt: now },
    { id: 'me_api', fieldId: 'field_backend', label: 'APIè¨­è¨', synonyms: ['API', 'REST API', 'GraphQL'], createdAt: now },
    { id: 'me_database', fieldId: 'field_backend', label: 'ãã¼ã¿ãã¼ã¹', synonyms: ['DB', 'SQL', 'ãã¼ã¿ãã¼ã¹è¨­è¨'], createdAt: now },
    { id: 'me_performance', fieldId: 'field_backend', label: 'ããã©ã¼ãã³ã¹æé©å', synonyms: ['ããã©ã¼ãã³ã¹æ¹å', 'é«éå', 'ãã¥ã¼ãã³ã°'], createdAt: now },

    // ã¤ã³ãã©ã»DevOps
    { id: 'me_cicd', fieldId: 'field_infra', label: 'CI/CD', synonyms: ['ç¶ç¶çã¤ã³ãã°ã¬ã¼ã·ã§ã³', 'ããã­ã¤èªåå'], createdAt: now },
    { id: 'me_security', fieldId: 'field_infra', label: 'ã»ã­ã¥ãªãã£', synonyms: ['æå ±ã»ã­ã¥ãªãã£', 'ãµã¤ãã¼ã»ã­ã¥ãªãã£'], createdAt: now },

    // æ°è¦é¡§å®¢ç²å¾
    { id: 'me_customer_acquisition', fieldId: 'field_acquisition', label: 'æ°è¦é¡§å®¢ç²å¾æ½ç­', synonyms: ['æ°è¦ç²å¾', 'ãªã¼ãã¸ã§ãã¬ã¼ã·ã§ã³', 'é¡§å®¢éæ'], createdAt: now },
    { id: 'me_competitor', fieldId: 'field_acquisition', label: 'ç«¶ååæ', synonyms: ['ç«¶åèª¿æ»', 'ç«¶äºåæ', 'ãã³ããã¼ã¯'], createdAt: now },

    // çµçã»è²¡å
    { id: 'me_budget', fieldId: 'field_accounting', label: 'äºç®ç®¡ç', synonyms: ['äºç®ç­å®', 'ãã¸ã§ãã', 'äºç®éå'], createdAt: now },

    // çµå¶æ¦ç¥
    { id: 'me_strategy', fieldId: 'field_strategy', label: 'çµå¶æ¦ç¥', synonyms: ['äºæ¥­æ¦ç¥', 'ä¸­æçµå¶è¨ç»', 'æ¦ç¥ç«æ¡'], createdAt: now },

    // ãã©ã³ãæ¦ç¥
    { id: 'me_branding', fieldId: 'field_branding', label: 'ãã©ã³ãã£ã³ã°', synonyms: ['ãã©ã³ãæ§ç¯', 'ãã©ã³ãæ¦ç¥', 'CI'], createdAt: now },

    // ãã­ã¸ã§ã¯ãç³»ï¼åéæ¨ªæ­ï¼
    { id: 'me_marketing_general', fieldId: 'field_content', label: 'ãã¼ã±ãã£ã³ã°', synonyms: ['ãã¼ã±', 'ãã¼ã±ãã£ã³ã°æ´»å'], createdAt: now },
    { id: 'me_web_renewal', fieldId: 'field_frontend', label: 'Webãªãã¥ã¼ã¢ã«PJ', synonyms: ['Webãªãã¥ã¼ã¢ã«', 'ãµã¤ããªãã¥ã¼ã¢ã«', 'Webå·æ°'], createdAt: now },
  ];

  // --- æ¢å­ãã¢ãã¼ãã¨ãã¹ã¿ã®ç´ä»ã ---
  linksStore = [
    // user_self ã®ãã¼ã
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

    // user_tanaka ã®ãã¼ã
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

    // user_sato ã®ãã¼ã
    { nodeId: 's-node-1', masterEntryId: 'me_design', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 's-node-2', masterEntryId: 'me_uiux', confidence: 0.98, confirmed: true, createdAt: now },
    { nodeId: 's-node-3', masterEntryId: 'me_prototype', confidence: 0.95, confirmed: true, createdAt: now },
    { nodeId: 's-node-4', masterEntryId: 'me_user_research', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 's-node-5', masterEntryId: 'me_cvr', confidence: 0.72, confirmed: false, createdAt: now },
    { nodeId: 's-node-6', masterEntryId: 'me_web_renewal', confidence: 0.99, confirmed: true, createdAt: now },
    { nodeId: 's-node-7', masterEntryId: 'me_figma', confidence: 0.99, confirmed: true, createdAt: now },
    { nodeId: 's-node-9', masterEntryId: 'me_accessibility', confidence: 0.96, confirmed: true, createdAt: now },

    // user_yamada ã®ãã¼ã
    { nodeId: 'y-node-1', masterEntryId: 'me_backend', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 'y-node-2', masterEntryId: 'me_api', confidence: 0.98, confirmed: true, createdAt: now },
    { nodeId: 'y-node-3', masterEntryId: 'me_database', confidence: 0.96, confirmed: true, createdAt: now },
    { nodeId: 'y-node-4', masterEntryId: 'me_security', confidence: 0.89, confirmed: false, createdAt: now },
    { nodeId: 'y-node-5', masterEntryId: 'me_web_renewal', confidence: 0.88, confirmed: true, createdAt: now },
    { nodeId: 'y-node-6', masterEntryId: 'me_cicd', confidence: 0.97, confirmed: true, createdAt: now },
    { nodeId: 'y-node-7', masterEntryId: 'me_performance', confidence: 0.93, confirmed: true, createdAt: now },
  ];
}

// ===== ãµã¼ãã¹ã¯ã©ã¹ =====

export class KnowledgeMasterService {
  /**
   * é åä¸è¦§ãåå¾
   */
  static async getDomains(): Promise<KnowledgeDomain[]> {
    const sb = getSupabase();

    if (sb) {
      const { data, error } = await sb
        .from('knowledge_domains')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          color: row.color,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
        }));
      }
    }

    // Fallback to demo data
    initDemoData();
    return [...domainsStore].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * åéä¸è¦§ãåå¾ï¼é åãã£ã«ã¿ã¼å¯¾å¿ï¼
   */
  static async getFields(domainId?: string): Promise<KnowledgeField[]> {
    const sb = getSupabase();

    if (sb) {
      let query = sb.from('knowledge_fields').select('*');

      if (domainId) {
        query = query.eq('domain_id', domainId);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          domainId: row.domain_id,
          name: row.name,
          description: row.description,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
        }));
      }
    }

    // Fallback to demo data
    initDemoData();
    let result = [...fieldsStore];
    if (domainId) {
      result = result.filter((f) => f.domainId === domainId);
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * ãã¹ã¿ã­ã¼ã¯ã¼ãä¸è¦§ãåå¾ï¼åéãã£ã«ã¿ã¼å¯¾å¿ï¼
   */
  static async getMasterEntries(fieldId?: string): Promise<KnowledgeMasterEntry[]> {
    const sb = getSupabase();

    if (sb) {
      let query = sb.from('knowledge_master_entries').select('*');

      if (fieldId) {
        query = query.eq('field_id', fieldId);
      }

      const { data, error } = await query;

      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          fieldId: row.field_id,
          label: row.label,
          synonyms: row.synonyms || [],
          description: row.description,
          createdAt: row.created_at,
        }));
      }
    }

    // Fallback to demo data
    initDemoData();
    let result = [...entriesStore];
    if (fieldId) {
      result = result.filter((e) => e.fieldId === fieldId);
    }
    return result;
  }

  /**
   * ãã¼ãâãã¹ã¿ã®ãªã³ã¯ä¸è¦§
   */
  static async getLinks(nodeId?: string): Promise<NodeMasterLink[]> {
    const sb = getSupabase();

    if (sb) {
      let query = sb.from('node_master_links').select('*');

      if (nodeId) {
        query = query.eq('node_id', nodeId);
      }

      const { data, error } = await query;

      if (!error && data) {
        return data.map(row => ({
          nodeId: row.node_id,
          masterEntryId: row.master_entry_id,
          confidence: row.confidence,
          confirmed: row.confirmed,
          createdAt: row.created_at,
        }));
      }
    }

    // Fallback to demo data
    initDemoData();
    if (nodeId) {
      return linksStore.filter((l) => l.nodeId === nodeId);
    }
    return [...linksStore];
  }

  /**
   * ãã¬ãã¸ãã¹ã¿ã®å¨éå±¤ããªã¼ãåå¾
   */
  static async getHierarchy(): Promise<KnowledgeHierarchy> {
    const sb = getSupabase();

    if (sb) {
      try {
        const [domainsRes, fieldsRes, entriesRes, linksRes] = await Promise.all([
          sb.from('knowledge_domains').select('*').order('sort_order', { ascending: true }),
          sb.from('knowledge_fields').select('*').order('sort_order', { ascending: true }),
          sb.from('knowledge_master_entries').select('*'),
          sb.from('node_master_links').select('*'),
        ]);

        if (
          !domainsRes.error && domainsRes.data &&
          !fieldsRes.error && fieldsRes.data &&
          !entriesRes.error && entriesRes.data &&
          !linksRes.error && linksRes.data
        ) {
          const domainMap = new Map(domainsRes.data.map(d => [d.id, d]));
          const fieldMap = new Map(fieldsRes.data.map(f => [f.id, f]));
          const entries = entriesRes.data;
          const links = linksRes.data;

          const domains = domainsRes.data
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((domain) => {
              const domainFields = fieldsRes.data
                .filter((f) => f.domain_id === domain.id)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((field) => {
                  const fieldEntries = entries.filter((e) => e.field_id === field.id);
                  const entryIds = new Set(fieldEntries.map((e) => e.id));
                  const nodeCount = links.filter((l) => entryIds.has(l.master_entry_id)).length;
                  return {
                    id: field.id,
                    domainId: field.domain_id,
                    name: field.name,
                    description: field.description,
                    sortOrder: field.sort_order,
                    createdAt: field.created_at,
                    entries: fieldEntries.map(e => ({
                      id: e.id,
                      fieldId: e.field_id,
                      label: e.label,
                      synonyms: e.synonyms || [],
                      description: e.description,
                      createdAt: e.created_at,
                    })),
                    nodeCount,
                  };
                });
              return {
                id: domain.id,
                name: domain.name,
                description: domain.description,
                color: domain.color,
                sortOrder: domain.sort_order,
                createdAt: domain.created_at,
                fields: domainFields,
              };
            });

          const totalEntries = entries.length;
          const unclassifiedCount = 0;

          return { domains, totalEntries, unclassifiedCount };
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
    initDemoData();

    const domains = domainsStore
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((domain) => {
        const domainFields = fieldsStore
          .filter((f) => f.domainId === domain.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((field) => {
            const fieldEntries = entriesStore.filter((e) => e.fieldId === field.id);
            const entryIds = new Set(fieldEntries.map((e) => e.id));
            const nodeCount = linksStore.filter((l) => entryIds.has(l.masterEntryId)).length;
            return { ...field, entries: fieldEntries, nodeCount };
          });
        return { ...domain, fields: domainFields };
      });

    const totalEntries = entriesStore.length;
    const unclassifiedCount = 0;

    return { domains, totalEntries, unclassifiedCount };
  }

  /**
   * ã­ã¼ã¯ã¼ããã«ã¼ã«ãã¼ã¹ã§èªååé¡
   * ï¼æ¬çªã§ã¯AI APIå¼ã³åºãã«ç½®ãæãï¼
   */
  static async classifyKeyword(label: string): Promise<ClassificationResult | null> {
    const sb = getSupabase();
    const normalizedLabel = label.toLowerCase().trim();

    if (sb) {
      try {
        const [entriesRes, fieldsRes, domainsRes] = await Promise.all([
          sb.from('knowledge_master_entries').select('*'),
          sb.from('knowledge_fields').select('*'),
          sb.from('knowledge_domains').select('*'),
        ]);

        if (
          !entriesRes.error && entriesRes.data &&
          !fieldsRes.error && fieldsRes.data &&
          !domainsRes.error && domainsRes.data
        ) {
          const entries = entriesRes.data;
          const fieldMap = new Map(fieldsRes.data.map(f => [f.id, f]));
          const domainMap = new Map(domainsRes.data.map(d => [d.id, d]));

          // å®å¨ä¸è´
          // BugFix⑧: 3段階マッチ（完全一致→前方一致→部分一致）
          let bestMatch: { entry: any; confidence: number } | null = null;

          for (const entry of entries) {
            const lowerLabel = entry.label.toLowerCase();
            const lowerSynonyms = (entry.synonyms || []).map((s: string) => s.toLowerCase());

            // ステップ1: 完全一致（最高信頼度）
            if (lowerLabel === lowerKeyword || lowerSynonyms.includes(lowerKeyword)) {
              bestMatch = { entry, confidence: 0.95 };
              break;
            }

            // ステップ2: 前方一致（高信頼度）
            if (lowerLabel.startsWith(lowerKeyword) ||
                lowerSynonyms.some((s: string) => s.startsWith(lowerKeyword))) {
              if (!bestMatch || bestMatch.confidence < 0.85) {
                bestMatch = { entry, confidence: 0.85 };
              }
              continue;
            }

            // ステップ3: 部分一致（閾値付き、3文字以上のみ）
            if (lowerKeyword.length >= 3) {
              if (lowerLabel.includes(lowerKeyword) ||
                  lowerSynonyms.some((s: string) => s.includes(lowerKeyword))) {
                const ratio = lowerKeyword.length / lowerLabel.length;
                const adjustedConfidence = Math.min(0.7, 0.4 + ratio * 0.4);
                if (!bestMatch || bestMatch.confidence < adjustedConfidence) {
                  bestMatch = { entry, confidence: adjustedConfidence };
                }
              }
            }
          }

          if (!bestMatch || bestMatch.confidence < 0.5) return null;

          const field = fields.find((f: any) => f.id === bestMatch!.entry.fieldId);
          const domain = field ? domains.find((d: any) => d.id === field.domainId) : null;
          if (!field || !domain) return null;

          return {
            domainId: domain.id,
            domainName: domain.name,
            fieldId: field.id,
            fieldName: field.name,
            masterEntryId: bestMatch.entry.id,
            confidence: bestMatch.confidence,
          };
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
    initDemoData();

    // ãã¹ã¿ã­ã¼ã¯ã¼ãã®å®å¨ä¸è´ã»åç¾©èªããã
    // BugFix⑧: 3段階マッチ（完全一致→前方一致→部分一致）
    let bestMatch: { entry: any; confidence: number } | null = null;

    for (const entry of entries) {
      const lowerLabel = entry.label.toLowerCase();
      const lowerSynonyms = (entry.synonyms || []).map((s: string) => s.toLowerCase());

      if (lowerLabel === lowerKeyword || lowerSynonyms.includes(lowerKeyword)) {
        bestMatch = { entry, confidence: 0.95 };
        break;
      }

      if (lowerLabel.startsWith(lowerKeyword) ||
          lowerSynonyms.some((s: string) => s.startsWith(lowerKeyword))) {
        if (!bestMatch || bestMatch.confidence < 0.85) {
          bestMatch = { entry, confidence: 0.85 };
        }
        continue;
      }

      if (lowerKeyword.length >= 3) {
        if (lowerLabel.includes(lowerKeyword) ||
            lowerSynonyms.some((s: string) => s.includes(lowerKeyword))) {
          const ratio = lowerKeyword.length / lowerLabel.length;
          const adjustedConfidence = Math.min(0.7, 0.4 + ratio * 0.4);
          if (!bestMatch || bestMatch.confidence < adjustedConfidence) {
            bestMatch = { entry, confidence: adjustedConfidence };
          }
        }
      }
    }

    if (!bestMatch || bestMatch.confidence < 0.5) return null;

    const field = fields.find((f: any) => f.id === bestMatch!.entry.fieldId);
    const domain = field ? domains.find((d: any) => d.id === field.domainId) : null;
    if (!field || !domain) return null;

    return {
      domainId: domain.id,
      domainName: domain.name,
      fieldId: field.id,
      fieldName: field.name,
      masterEntryId: bestMatch.entry.id,
      confidence: bestMatch.confidence,
    }; // åé¡ä¸è½
  }

  /**
   * ãã¼ãããã¹ã¿ã­ã¼ã¯ã¼ãã«ç´ä»ã
   */
  static async linkNodeToMaster(
    nodeId: string,
    masterEntryId: string,
    confidence: number = 0.9
  ): Promise<NodeMasterLink> {
    const sb = getSupabase();
    const now = new Date().toISOString();

    if (sb) {
      try {
        const { data, error } = await sb
          .from('node_master_links')
          .upsert(
            {
              node_id: nodeId,
              master_entry_id: masterEntryId,
              confidence,
              confirmed: false,
              created_at: now,
            },
            { onConflict: 'node_id,master_entry_id' }
          )
          .select()
          .single();

        if (!error && data) {
          return {
            nodeId: data.node_id,
            masterEntryId: data.master_entry_id,
            confidence: data.confidence,
            confirmed: data.confirmed,
            createdAt: data.created_at,
          };
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
    initDemoData();

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
      createdAt: now,
    };
    linksStore.push(link);
    return link;
  }

  /**
   * ãªã³ã¯ãã¦ã¼ã¶ã¼ç¢ºèªæ¸ã¿ã«ãã
   */
  static async confirmLink(nodeId: string, masterEntryId: string): Promise<NodeMasterLink | null> {
    const sb = getSupabase();

    if (sb) {
      try {
        const { data, error } = await sb
          .from('node_master_links')
          .update({ confirmed: true })
          .eq('node_id', nodeId)
          .eq('master_entry_id', masterEntryId)
          .select()
          .single();

        if (!error && data) {
          return {
            nodeId: data.node_id,
            masterEntryId: data.master_entry_id,
            confidence: data.confidence,
            confirmed: data.confirmed,
            createdAt: data.created_at,
          };
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
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
   * é åãè¿½å 
   */
  static async addDomain(
    name: string,
    description: string,
    color: string
  ): Promise<KnowledgeDomain> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const id = `domain_${Date.now()}`;

    if (sb) {
      try {
        const { data: maxData } = await sb
          .from('knowledge_domains')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        const sortOrder = (maxData?.sort_order || 0) + 1;

        const { data, error } = await sb
          .from('knowledge_domains')
          .insert({
            id,
            name,
            description,
            color,
            sort_order: sortOrder,
            created_at: now,
          })
          .select()
          .single();

        if (!error && data) {
          return {
            id: data.id,
            name: data.name,
            description: data.description,
            color: data.color,
            sortOrder: data.sort_order,
            createdAt: data.created_at,
          };
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
    initDemoData();
    const domain: KnowledgeDomain = {
      id,
      name,
      description,
      color,
      sortOrder: domainsStore.length + 1,
      createdAt: now,
    };
    domainsStore.push(domain);
    return domain;
  }

  /**
   * åéãè¿½å 
   */
  static async addField(
    domainId: string,
    name: string,
    description: string
  ): Promise<KnowledgeField> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const id = `field_${Date.now()}`;

    if (sb) {
      try {
        const { data: maxData } = await sb
          .from('knowledge_fields')
          .select('sort_order')
          .eq('domain_id', domainId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        const sortOrder = (maxData?.sort_order || 0) + 1;

        const { data, error } = await sb
          .from('knowledge_fields')
          .insert({
            id,
            domain_id: domainId,
            name,
            description,
            sort_order: sortOrder,
            created_at: now,
          })
          .select()
          .single();

        if (!error && data) {
          return {
            id: data.id,
            domainId: data.domain_id,
            name: data.name,
            description: data.description,
            sortOrder: data.sort_order,
            createdAt: data.created_at,
          };
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
    initDemoData();
    const existingFields = fieldsStore.filter((f) => f.domainId === domainId);
    const field: KnowledgeField = {
      id,
      domainId,
      name,
      description,
      sortOrder: existingFields.length + 1,
      createdAt: now,
    };
    fieldsStore.push(field);
    return field;
  }

  /**
   * é åãã¨ã®ãã¼ãçµ±è¨
   */
  static async getDomainStats(): Promise<
    { domainId: string; domainName: string; color: string; nodeCount: number; fieldCount: number }[]
  > {
    const sb = getSupabase();

    if (sb) {
      try {
        const [domainsRes, fieldsRes, entriesRes, linksRes] = await Promise.all([
          sb.from('knowledge_domains').select('*').order('sort_order', { ascending: true }),
          sb.from('knowledge_fields').select('*'),
          sb.from('knowledge_master_entries').select('*'),
          sb.from('node_master_links').select('*'),
        ]);

        if (
          !domainsRes.error && domainsRes.data &&
          !fieldsRes.error && fieldsRes.data &&
          !entriesRes.error && entriesRes.data &&
          !linksRes.error && linksRes.data
        ) {
          return domainsRes.data
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((domain) => {
              const domainFields = fieldsRes.data.filter((f) => f.domain_id === domain.id);
              const fieldIds = new Set(domainFields.map((f) => f.id));
              const domainEntryIds = new Set(
                entriesRes.data.filter((e) => fieldIds.has(e.field_id)).map((e) => e.id)
              );
              const nodeCount = linksRes.data.filter((l) =>
                domainEntryIds.has(l.master_entry_id)
              ).length;
              return {
                domainId: domain.id,
                domainName: domain.name,
                color: domain.color,
                nodeCount,
                fieldCount: domainFields.length,
              };
            });
        }
      } catch (err) {
        // Fall through to demo data
      }
    }

    // Fallback to demo data
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
