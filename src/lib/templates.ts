import type { MetaTemplate } from './types';

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getTemplateTimestamp(template: MetaTemplate) {
  const parsedUpdatedAt = Date.parse(template.updatedAt);

  if (!Number.isNaN(parsedUpdatedAt)) {
    return parsedUpdatedAt;
  }

  const parsedCreatedAt = Date.parse(template.createdAt);
  return Number.isNaN(parsedCreatedAt) ? 0 : parsedCreatedAt;
}

export function sortMetaTemplates(templates: MetaTemplate[]) {
  return [...templates].sort((left, right) => {
    const timeDelta = getTemplateTimestamp(right) - getTemplateTimestamp(left);

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

export function mapTemplateRecord(row: Record<string, unknown>): MetaTemplate {
  return {
    id: String(row.id || ''),
    metaTemplateId: normalizeOptionalString(row.meta_template_id),
    name: String(row.template_name || ''),
    category: normalizeOptionalString(row.category),
    language: String(row.language || 'en_US'),
    status: normalizeOptionalString(row.status),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    raw:
      row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
        ? (row.raw as Record<string, unknown>)
        : {},
  };
}

export function upsertTemplate(current: MetaTemplate[], nextTemplate: MetaTemplate) {
  return sortMetaTemplates([...current.filter((template) => template.id !== nextTemplate.id), nextTemplate]);
}

export function removeTemplate(current: MetaTemplate[], templateId: string) {
  return current.filter((template) => template.id !== templateId);
}
