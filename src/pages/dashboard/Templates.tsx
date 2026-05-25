import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUpRight,
  Bold,
  CheckCircle2,
  Clock,
  CornerDownLeft,
  Copy,
  FileUp,
  FileText,
  Globe,
  ImageIcon,
  Italic,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Smile,
  Strikethrough,
  Trash2,
  Type,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { sortMetaTemplates } from '../../lib/templates';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import type { CreateTemplateInput, MetaTemplate, WhatsAppFlow } from '../../lib/types';

const EMOJI_CHOICES = ['😀', '😍', '🙏', '🔥', '🎉', '✨', '👍', '❤️', '🚀', '📦', '✅', '💬'];
const MAX_TEMPLATE_URL_BUTTONS = 1;
const MAX_TEMPLATE_QUICK_REPLY_BUTTONS = 2;
const MAX_TEMPLATE_FLOW_BUTTONS = 1;
const MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH = 25;
const TEMPLATE_HEADER_MEDIA_PREVIEW_KEY = '__connektly_header_media_preview';
const LANGUAGE_OPTIONS = [
  { code: 'af', label: 'Afrikaans' },
  { code: 'ar', label: 'Arabic' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'zh_CN', label: 'Chinese (Simplified)' },
  { code: 'zh_TW', label: 'Chinese (Traditional)' },
  { code: 'nl', label: 'Dutch' },
  { code: 'en', label: 'English' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ko', label: 'Korean' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mr', label: 'Marathi' },
  { code: 'no', label: 'Norwegian' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt_BR', label: 'Portuguese (Brazil)' },
  { code: 'pt_PT', label: 'Portuguese (Portugal)' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'es', label: 'Spanish' },
  { code: 'es_MX', label: 'Spanish (Mexico)' },
  { code: 'sw', label: 'Swahili' },
  { code: 'sv', label: 'Swedish' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'vi', label: 'Vietnamese' },
] as const;

type TemplateButton =
  | { id: string; type: 'URL'; text: string; url: string }
  | { id: string; type: 'QUICK_REPLY'; text: string; url: string }
  | {
      id: string;
      type: 'FLOW';
      text: string;
      url: string;
      flowId: string;
      flowAction: 'navigate' | 'data_exchange';
      navigateScreen: string;
    };

type HeaderType = CreateTemplateInput['headerType'];

type HeaderMediaPreviewMetadata = {
  previewUrl: string;
  fileName?: string;
  mimeType?: string;
};

function createEmptyTemplateForm() {
  return {
    name: '',
    category: 'MARKETING' as CreateTemplateInput['category'],
    language: 'en_US',
    headerType: 'NONE' as HeaderType,
    headerText: '',
    headerMediaHandle: '',
    headerMediaFileName: '',
    headerMediaMimeType: '',
    headerMediaPreviewUrl: '',
    headerMediaStoredPreviewUrl: '',
    body: '',
    footer: '',
    buttons: [] as TemplateButton[],
  };
}

function getHeaderMediaAccept(headerType: HeaderType) {
  switch (headerType) {
    case 'IMAGE':
      return 'image/*';
    case 'VIDEO':
      return 'video/*';
    case 'DOCUMENT':
      return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'NONE':
    case 'TEXT':
    default:
      return undefined;
  }
}

function getHeaderMediaKindLabel(headerType: HeaderType) {
  switch (headerType) {
    case 'IMAGE':
      return 'image';
    case 'VIDEO':
      return 'video';
    case 'DOCUMENT':
      return 'document';
    case 'NONE':
    case 'TEXT':
    default:
      return 'media';
  }
}

function getMediaHeaderType(value: string | null): HeaderType | null {
  const normalizedValue = value?.trim().toUpperCase();

  if (normalizedValue === 'IMAGE' || normalizedValue === 'VIDEO' || normalizedValue === 'DOCUMENT') {
    return normalizedValue;
  }

  return null;
}

function getStoredHeaderMediaPreview(raw: Record<string, unknown> | null | undefined): HeaderMediaPreviewMetadata | null {
  const value = raw?.[TEMPLATE_HEADER_MEDIA_PREVIEW_KEY];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const previewUrl = typeof record.url === 'string' && record.url.trim() ? record.url.trim() : '';

  if (!previewUrl) {
    return null;
  }

  return {
    previewUrl,
    fileName: typeof record.fileName === 'string' ? record.fileName : undefined,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
  };
}

function HeaderMediaPreview({
  headerType,
  previewUrl,
  fileName,
  mimeType,
}: {
  headerType: HeaderType;
  previewUrl?: string;
  fileName?: string;
  mimeType?: string;
}) {
  const headerLabel = `${headerType.charAt(0)}${headerType.slice(1).toLowerCase()} header preview`;

  if (headerType === 'IMAGE') {
    return previewUrl ? (
      <img src={previewUrl} alt={fileName || 'Selected header image'} className="mb-4 h-40 w-full rounded-2xl bg-gray-100 object-cover" />
    ) : (
      <div className="mb-4 flex h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-gray-100 px-4 text-center text-sm font-medium text-gray-500">
        <ImageIcon className="h-5 w-5" />
        <span>{headerLabel}</span>
      </div>
    );
  }

  if (headerType === 'VIDEO') {
    return previewUrl ? (
      <video src={previewUrl} className="mb-4 h-40 w-full rounded-2xl bg-gray-950 object-cover" controls muted playsInline />
    ) : (
      <div className="mb-4 flex h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-gray-100 px-4 text-center text-sm font-medium text-gray-500">
        <Video className="h-5 w-5" />
        <span>{headerLabel}</span>
      </div>
    );
  }

  if (headerType === 'DOCUMENT') {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5b45ff] shadow-sm">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{fileName || 'Document header preview'}</p>
          <p className="truncate text-xs text-gray-500">{mimeType || 'Choose a document to preview it here'}</p>
        </div>
      </div>
    );
  }

  return null;
}

function applyWrapper(value: string, wrapper: string) {
  return `${wrapper}${value}${wrapper}`;
}

function normalizeTemplateName(value: string) {
  return normalizeTemplateNameInput(value).replace(/^_+|_+$/g, '');
}

function normalizeTemplateNameInput(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return [];
  }

  const components = raw.components;

  return Array.isArray(components)
    ? components.filter((component): component is Record<string, unknown> => Boolean(component) && typeof component === 'object' && !Array.isArray(component))
    : [];
}

function normalizeTemplateSnapshot(
  raw: Record<string, unknown> | null | undefined,
  fallback?: { name?: string | null; language?: string | null },
) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallback?.name) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallback?.name || null,
    language: typeof raw?.language === 'string' ? raw.language : fallback?.language || null,
    components,
  };
}

function getTemplateTextComponent(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  type: 'HEADER' | 'BODY' | 'FOOTER',
) {
  if (!snapshot) {
    return null;
  }

  return snapshot.components.find((component) => component.type === type) || null;
}

function getTemplateButtons(snapshot: ReturnType<typeof normalizeTemplateSnapshot>) {
  if (!snapshot) {
    return [];
  }

  const buttonsComponent = snapshot.components.find((component) => component.type === 'BUTTONS');
  const buttons = buttonsComponent?.buttons;

  return Array.isArray(buttons)
    ? buttons.filter((button): button is Record<string, unknown> => Boolean(button) && typeof button === 'object' && !Array.isArray(button))
    : [];
}

function getFlowEntryScreen(flow: WhatsAppFlow | null | undefined) {
  const flowJson = flow?.raw?.flow_json;
  const screens = flowJson && typeof flowJson === 'object' && !Array.isArray(flowJson)
    ? (flowJson as { screens?: unknown }).screens
    : null;
  const firstScreen = Array.isArray(screens) && screens[0] && typeof screens[0] === 'object'
    ? screens[0] as { id?: unknown }
    : null;

  return typeof firstScreen?.id === 'string' && firstScreen.id.trim() ? firstScreen.id.trim() : '';
}

function getTemplateButtonKindLabel(button: TemplateButton) {
  switch (button.type) {
    case 'URL':
      return 'Visit Website';
    case 'FLOW':
      return 'Flow';
    case 'QUICK_REPLY':
    default:
      return 'Quick Reply';
  }
}

function RichText({ value }: { value: string }) {
  const lines = value.split('\n');

  const renderInline = (line: string) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).filter(Boolean);

    return parts.map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        );
      }

      if (part.startsWith('_') && part.endsWith('_')) {
        return (
          <em key={`${part}-${index}`} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {renderInline(line)}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function TemplatePreviewCard({ template }: { template: MetaTemplate }) {
  const snapshot = normalizeTemplateSnapshot(template.raw, {
    name: template.name,
    language: template.language,
  });
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const footerComponent = getTemplateTextComponent(snapshot, 'FOOTER');
  const buttons = getTemplateButtons(snapshot);
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';
  const headerFormat = typeof headerComponent?.format === 'string' ? headerComponent.format : null;
  const mediaHeaderType = getMediaHeaderType(headerFormat);
  const headerMediaPreview = getStoredHeaderMediaPreview(template.raw);
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const footerText = typeof footerComponent?.text === 'string' ? footerComponent.text.trim() : '';
  const languageLabel = LANGUAGE_OPTIONS.find((option) => option.code === template.language)?.label || template.language;

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.5rem] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="rounded-[2rem] border border-gray-100 bg-[#f7f7f5] p-4">
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            <ChannelBrandIcon channel="whatsapp" className="h-10 w-10 shrink-0" alt="" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Connektly</p>
              <p className="text-[11px] text-gray-500">{languageLabel}</p>
            </div>
          </div>
          <div className="text-xs text-gray-400">12:04</div>
        </div>

        <div className="mb-4 rounded-2xl bg-[#dff3f2] px-4 py-3 text-xs text-[#52656f]">
          This business uses a secure service from Meta to manage this chat. Tap to learn more
        </div>

        <div className="rounded-[1.6rem] bg-white p-5 shadow-sm">
          {mediaHeaderType ? (
            <HeaderMediaPreview
              headerType={mediaHeaderType}
              previewUrl={headerMediaPreview?.previewUrl}
              fileName={headerMediaPreview?.fileName}
              mimeType={headerMediaPreview?.mimeType}
            />
          ) : null}

          {headerText ? (
            <div className="mb-4 text-[1.05rem] font-bold text-gray-900">
              <RichText value={headerText} />
            </div>
          ) : null}

          <div className="text-[1.02rem] leading-8 text-gray-900">
            <RichText value={bodyText || snapshot?.name || 'Template preview unavailable.'} />
          </div>

          {footerText ? (
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-sm text-gray-500">
                <RichText value={footerText} />
              </p>
              <span className="text-sm text-gray-400">12:04</span>
            </div>
          ) : null}

          {buttons.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {buttons.map((button, index) => {
                const text = typeof button.text === 'string' ? button.text : `Action ${index + 1}`;
                const type = typeof button.type === 'string' ? button.type : 'QUICK_REPLY';
                const isFlowButton = type === 'FLOW';

                return (
                  <div key={`${text}-${index}`} className="flex items-center justify-center gap-2 text-center text-[1rem] font-medium text-[#4e8ed8]">
                    {type === 'URL' ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : isFlowButton ? (
                      <ListChecks className="h-4 w-4" />
                    ) : (
                      <CornerDownLeft className="h-4 w-4" />
                    )}
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  const { bootstrap, refresh } = useAppData();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(createEmptyTemplateForm);
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [isFlowsLoading, setIsFlowsLoading] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const headerMediaInputRef = useRef<HTMLInputElement | null>(null);
  const headerMediaUploadTokenRef = useRef(0);
  const deferredQuery = useDeferredValue(searchQuery);
  const hasConnectedChannel = Boolean(bootstrap?.channel);
  const hasMediaHeader =
    createForm.headerType === 'IMAGE' || createForm.headerType === 'VIDEO' || createForm.headerType === 'DOCUMENT';

  const templates = bootstrap?.templates || [];
  const previewTemplate = templates.find((template) => template.id === previewTemplateId) || null;
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const baseTemplates = !normalizedQuery
      ? templates
      : templates.filter((template) => {
          return (
            template.name.toLowerCase().includes(normalizedQuery) ||
            (template.category || '').toLowerCase().includes(normalizedQuery) ||
            template.language.toLowerCase().includes(normalizedQuery)
          );
        });

    return sortMetaTemplates(baseTemplates);
  }, [deferredQuery, templates]);

  const selectedLanguageLabel =
    LANGUAGE_OPTIONS.find((option) => option.code === createForm.language)?.label || createForm.language;
  const urlButtonCount = createForm.buttons.filter((button) => button.type === 'URL').length;
  const quickReplyButtonCount = createForm.buttons.filter((button) => button.type === 'QUICK_REPLY').length;
  const flowButtonCount = createForm.buttons.filter((button) => button.type === 'FLOW').length;
  const canAddUrlButton = urlButtonCount < MAX_TEMPLATE_URL_BUTTONS;
  const canAddQuickReplyButton = quickReplyButtonCount < MAX_TEMPLATE_QUICK_REPLY_BUTTONS;
  const canAddFlowButton = flowButtonCount < MAX_TEMPLATE_FLOW_BUTTONS;

  useEffect(() => {
    const previewUrl = createForm.headerMediaPreviewUrl;

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [createForm.headerMediaPreviewUrl]);

  useEffect(() => {
    if (!hasConnectedChannel || !isCreateOpen) {
      return;
    }

    let isActive = true;
    setIsFlowsLoading(true);
    appApi.getFlows()
      .then((response) => {
        if (isActive) {
          setFlows(response.flows.filter((flow) => Boolean(flow.metaFlowId) && flow.status === 'PUBLISHED'));
        }
      })
      .catch((error) => {
        if (isActive) {
          setCreateError(error instanceof Error ? error.message : 'Failed to load Flows.');
        }
      })
      .finally(() => {
        if (isActive) {
          setIsFlowsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [hasConnectedChannel, isCreateOpen]);

  const openCreateModal = () => {
    setCreateError(null);
    setIsEmojiOpen(false);
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    headerMediaUploadTokenRef.current += 1;
    setIsBusy((current) => (current === 'header-media-upload' ? null : current));
    setIsCreateOpen(false);
    setIsEmojiOpen(false);
    setCreateError(null);
    setCreateForm(createEmptyTemplateForm());
  };

  const closePreviewModal = () => {
    setPreviewTemplateId(null);
  };

  useEscapeKey(isCreateOpen, closeCreateModal);
  useEscapeKey(Boolean(previewTemplate), closePreviewModal);
  useBodyScrollLock(isCreateOpen || Boolean(previewTemplate));

  const modalRoot = typeof document === 'undefined' ? null : document.body;

  const handleDelete = async (id: string) => {
    try {
      setIsBusy(`delete:${id}`);
      setPageError(null);
      await appApi.deleteTemplate(id);
      await refresh();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to delete template.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      setIsBusy(`duplicate:${id}`);
      setPageError(null);
      await appApi.duplicateTemplate(id);
      await refresh();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to duplicate template.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    const normalizedName = normalizeTemplateName(createForm.name);
    const trimmedBody = createForm.body.trim();
    const trimmedHeaderText = createForm.headerText.trim();
    const trimmedHeaderMediaHandle = createForm.headerMediaHandle.trim();
    const incompleteButtonIndex = createForm.buttons.findIndex((button) => {
      if (!button.text.trim()) {
        return true;
      }

      if (button.type === 'URL') {
        return !button.url.trim();
      }

      if (button.type === 'FLOW') {
        return !button.flowId;
      }

      return false;
    });

    if (!hasConnectedChannel) {
      setCreateError('Connect a WhatsApp Business account before creating Meta templates.');
      return;
    }

    if (!normalizedName || !trimmedBody) {
      setCreateError('Template name and body are required.');
      return;
    }

    if (createForm.headerType === 'TEXT' && !trimmedHeaderText) {
      setCreateError('Header text is required when the campaign title type is Text.');
      return;
    }

    if (hasMediaHeader && !trimmedHeaderMediaHandle) {
      setCreateError(`Upload a sample ${getHeaderMediaKindLabel(createForm.headerType)} file before creating this template.`);
      return;
    }

    if (incompleteButtonIndex >= 0) {
      setCreateError(`Complete or remove button ${incompleteButtonIndex + 1} before creating the template.`);
      return;
    }

    if (
      urlButtonCount > MAX_TEMPLATE_URL_BUTTONS ||
      quickReplyButtonCount > MAX_TEMPLATE_QUICK_REPLY_BUTTONS ||
      flowButtonCount > MAX_TEMPLATE_FLOW_BUTTONS
    ) {
      setCreateError('Templates can include a maximum of 1 URL button, 2 quick reply buttons, and 1 Flow button.');
      return;
    }

    const longFlowButtonIndex = createForm.buttons.findIndex((button) => {
      return button.type === 'FLOW' && button.text.trim().length > MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH;
    });

    if (longFlowButtonIndex >= 0) {
      setCreateError(`Flow button text must be ${MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH} characters or less.`);
      return;
    }

    try {
      setIsBusy('create');
      setCreateError(null);
      await appApi.createTemplate({
        name: normalizedName,
        category: createForm.category,
        language: createForm.language,
        headerType: createForm.headerType,
        headerText: trimmedHeaderText || undefined,
        headerMediaHandle: trimmedHeaderMediaHandle || undefined,
        headerMediaPreviewUrl: createForm.headerMediaStoredPreviewUrl.trim() || undefined,
        headerMediaFileName: createForm.headerMediaFileName.trim() || undefined,
        headerMediaMimeType: createForm.headerMediaMimeType.trim() || undefined,
        body: trimmedBody,
        footer: createForm.footer.trim() || undefined,
        buttons: createForm.buttons
          .filter((button) => button.text.trim())
          .map((button) =>
            button.type === 'URL'
              ? { type: 'URL' as const, text: button.text.trim(), url: button.url.trim() }
              : button.type === 'FLOW'
                ? {
                    type: 'FLOW' as const,
                    text: button.text.trim(),
                    flowId: button.flowId,
                    flowAction: button.flowAction,
                    navigateScreen: button.flowAction === 'navigate' ? button.navigateScreen.trim() : undefined,
                  }
                : { type: 'QUICK_REPLY' as const, text: button.text.trim() },
          ),
      });
      await refresh();
      closeCreateModal();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create template.');
    } finally {
      setIsBusy(null);
    }
  };

  const insertIntoBody = (value: string) => {
    setCreateForm((current) => ({ ...current, body: `${current.body}${value}` }));
  };

  const addVariable = () => {
    const nextVariable = ((createForm.body.match(/\{\{\d+\}\}/g) || []).length || 0) + 1;
    insertIntoBody(`{{${nextVariable}}}`);
  };

  const handleHeaderTypeChange = (headerType: HeaderType) => {
    headerMediaUploadTokenRef.current += 1;
    setIsBusy((current) => (current === 'header-media-upload' ? null : current));
    setCreateForm((current) => ({
      ...current,
      headerType,
      headerMediaHandle: '',
      headerMediaFileName: '',
      headerMediaMimeType: '',
      headerMediaPreviewUrl: '',
      headerMediaStoredPreviewUrl: '',
    }));
  };

  const handleHeaderMediaPicked = async (file: File) => {
    const selectedHeaderType = createForm.headerType;

    if (selectedHeaderType === 'IMAGE' && !file.type.startsWith('image/')) {
      setCreateError('Choose an image file for an image campaign title.');
      return;
    }

    if (selectedHeaderType === 'VIDEO' && !file.type.startsWith('video/')) {
      setCreateError('Choose a video file for a video campaign title.');
      return;
    }

    const uploadToken = headerMediaUploadTokenRef.current + 1;
    const previewUrl = URL.createObjectURL(file);
    const mimeType = file.type || 'Unknown file type';
    headerMediaUploadTokenRef.current = uploadToken;
    setCreateForm((current) => ({
      ...current,
      headerMediaHandle: '',
      headerMediaFileName: file.name,
      headerMediaMimeType: mimeType,
      headerMediaPreviewUrl: previewUrl,
      headerMediaStoredPreviewUrl: '',
    }));

    try {
      setIsBusy('header-media-upload');
      setCreateError(null);

      const uploaded = await appApi.uploadTemplateHeaderMedia(file);

      if (headerMediaUploadTokenRef.current !== uploadToken) {
        return;
      }

      setCreateForm((current) =>
        current.headerType === selectedHeaderType && current.headerMediaPreviewUrl === previewUrl
          ? {
              ...current,
              headerMediaHandle: uploaded.headerMediaHandle,
              headerMediaFileName: uploaded.fileName,
              headerMediaMimeType: uploaded.mimeType,
              headerMediaStoredPreviewUrl: uploaded.headerMediaPreviewUrl,
            }
          : current,
      );
    } catch (error) {
      if (headerMediaUploadTokenRef.current === uploadToken) {
        setCreateError(error instanceof Error ? error.message : 'Failed to upload template header media.');
      }
    } finally {
      if (headerMediaUploadTokenRef.current === uploadToken) {
        setIsBusy(null);
      }
      if (headerMediaInputRef.current) {
        headerMediaInputRef.current.value = '';
      }
    }
  };

  const removeHeaderMedia = () => {
    headerMediaUploadTokenRef.current += 1;
    setIsBusy((current) => (current === 'header-media-upload' ? null : current));
    setCreateError(null);
    setCreateForm((current) => ({
      ...current,
      headerMediaHandle: '',
      headerMediaFileName: '',
      headerMediaMimeType: '',
      headerMediaPreviewUrl: '',
      headerMediaStoredPreviewUrl: '',
    }));

    if (headerMediaInputRef.current) {
      headerMediaInputRef.current.value = '';
    }
  };

  const addButton = (type: TemplateButton['type']) => {
    if (type === 'URL' && !canAddUrlButton) {
      setCreateError('Only 1 URL button can be added to a template.');
      return;
    }

    if (type === 'QUICK_REPLY' && !canAddQuickReplyButton) {
      setCreateError('Only 2 quick reply buttons can be added to a template.');
      return;
    }

    if (type === 'FLOW' && !canAddFlowButton) {
      setCreateError('Only 1 Flow button can be added to a template.');
      return;
    }

    setCreateError(null);
    setCreateForm((current) => ({
      ...current,
      buttons: [
        ...current.buttons,
        type === 'FLOW'
          ? {
              id: `${type}_${Date.now()}_${current.buttons.length}`,
              type,
              text: '',
              url: '',
              flowId: '',
              flowAction: 'navigate',
              navigateScreen: '',
            }
          : {
              id: `${type}_${Date.now()}_${current.buttons.length}`,
              type,
              text: '',
              url: '',
            },
      ],
    }));
  };

  const getStatusBadge = (status: string | null) => {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case 'pending':
      case 'in_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
      case 'rejected':
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <XCircle className="w-3.5 h-3.5" /> {status}
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status || 'Unknown'}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Templates</h1>
          <p className="text-gray-500 text-sm mt-1">
            Templates are loaded from your connected WhatsApp Business Account and can be managed from here.
          </p>
        </div>
      </div>

      <FeedbackPopupStack
        items={
          pageError
            ? [{ id: 'templates-error', tone: 'error' as const, message: pageError, onDismiss: () => setPageError(null) }]
            : []
        }
      />

      <div className="flex flex-col lg:flex-row justify-between gap-4">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates by name, category, or language"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#5b45ff] focus:border-[#5b45ff] outline-none text-sm shadow-sm"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-[#5b45ff] hover:bg-[#4a35e8] text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-[#5b45ff]/30 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Template
          </button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                <th className="p-4 pl-6 font-medium">Template Name</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium">Language</th>
                <th className="p-4 font-medium">Approval Status</th>
                <th className="p-4 font-medium">Last Sync</th>
                <th className="p-4 pr-6 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredTemplates.map((template) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    key={template.id}
                    onClick={() => setPreviewTemplateId(template.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPreviewTemplateId(template.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Preview template ${template.name}`}
                    className="group cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50/50 focus:bg-[#f8f7ff] focus:outline-none"
                  >
                    <td className="p-4 pl-6 text-sm font-semibold text-gray-900">{template.name}</td>
                    <td className="p-4 text-sm text-gray-600">{template.category || 'Unknown'}</td>
                    <td className="p-4 text-sm text-gray-600">{template.language}</td>
                    <td className="p-4">{getStatusBadge(template.status)}</td>
                    <td className="p-4 text-sm text-gray-500">{new Date(template.updatedAt).toLocaleString()}</td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDuplicate(template.id);
                          }}
                          disabled={Boolean(isBusy)}
                          className="p-2 text-gray-400 hover:text-[#5b45ff] hover:bg-[#5b45ff]/10 rounded-lg transition-colors"
                          title="Duplicate Template"
                        >
                          {isBusy === `duplicate:${template.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDelete(template.id);
                          }}
                          disabled={Boolean(isBusy)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Template"
                        >
                          {isBusy === `delete:${template.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {filteredTemplates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">No templates found</h3>
              <p className="text-gray-500 text-sm">
                {templates.length === 0
                  ? 'Connect WhatsApp to load live templates from Meta.'
                  : 'We could not find any templates matching your search.'}
              </p>
            </div>
          ) : null}
        </div>
      </motion.div>

      {modalRoot
        ? createPortal(
            <AnimatePresence>
              {previewTemplate ? (
                <div className="fixed inset-0 z-[130] overflow-y-auto">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePreviewModal}
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
              aria-label="Close template preview"
            />
              <div className="relative flex min-h-full items-center justify-center p-4">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 20 }}
                  className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-2xl"
                >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5b45ff]">Template Preview</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">{previewTemplate.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">Preview the exact rich content structure that will appear in WhatsApp.</p>
                </div>
                <button onClick={closePreviewModal} className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-6 overflow-y-auto bg-[#fafafa] p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-400">Details</h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Category</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{previewTemplate.category || 'Unknown'}</p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Language</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {LANGUAGE_OPTIONS.find((option) => option.code === previewTemplate.language)?.label || previewTemplate.language}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Approval Status</p>
                        <div className="mt-2">{getStatusBadge(previewTemplate.status)}</div>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Last Sync</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{new Date(previewTemplate.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-400">Usage</h3>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                      This preview uses the template components synced from Meta, including header content, body text, footer text, and action buttons.
                    </p>
                  </div>
                </div>

                <div className="flex items-start justify-center">
                  <TemplatePreviewCard template={previewTemplate} />
                </div>
              </div>
                </motion.div>
              </div>
                </div>
              ) : null}
            </AnimatePresence>,
            modalRoot,
          )
        : null}

      {modalRoot
        ? createPortal(
            <AnimatePresence>
              {isCreateOpen ? (
                <div className="fixed inset-0 z-[130] overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCreateModal} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
              <div className="relative flex min-h-full items-center justify-center p-4">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 20 }}
                  className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-2xl"
                >
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Create Template</h2>
                  <p className="text-sm text-gray-500">Design the real Meta template payload and preview it live.</p>
                </div>
                <button onClick={closeCreateModal} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-h-0 space-y-6 overflow-y-auto bg-[#fafafa] p-6">
                  {createError ? (
                    <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</div>
                  ) : null}

                  {!hasConnectedChannel ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Connect a WhatsApp Business account before creating live Meta templates.
                    </div>
                  ) : null}

                  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-xl font-bold text-gray-900">Template setup</p>
                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-gray-700">Template Name</label>
                        <div className="relative">
                          <Type className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            value={createForm.name}
                            onChange={(event) =>
                              setCreateForm((current) => ({ ...current, name: normalizeTemplateNameInput(event.target.value) }))
                            }
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            placeholder="order_update_template"
                            required
                          />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">No spaces allowed. Use lowercase letters, numbers, and underscores only.</p>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Category</label>
                        <DropdownSelect
                          value={createForm.category}
                          onChange={(nextCategory) => setCreateForm((current) => ({ ...current, category: nextCategory as CreateTemplateInput['category'] }))}
                          options={[
                            { value: 'UTILITY', label: 'Utility' },
                            { value: 'MARKETING', label: 'Marketing' },
                            { value: 'AUTHENTICATION', label: 'Authentication' },
                          ]}
                          ariaLabel="Select template category"
                          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="mb-2 block text-sm font-medium text-gray-700">Language</label>
                        <DropdownSelect
                          value={createForm.language}
                          onChange={(nextLanguage) => setCreateForm((current) => ({ ...current, language: nextLanguage }))}
                          options={LANGUAGE_OPTIONS.map((language) => ({
                            value: language.code,
                            label: `${language.label} (${language.code})`,
                          }))}
                          icon={<Globe className="h-4 w-4" />}
                          ariaLabel="Select template language"
                          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-xl font-bold text-gray-900">Content</p>
                    <div className="mt-5 space-y-5">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Campaign title (Optional)</label>
                        <DropdownSelect
                          value={createForm.headerType}
                          onChange={(nextHeaderType) => handleHeaderTypeChange(nextHeaderType as HeaderType)}
                          options={[
                            { value: 'NONE', label: 'None' },
                            { value: 'TEXT', label: 'Text' },
                            { value: 'IMAGE', label: 'Image' },
                            { value: 'VIDEO', label: 'Video' },
                            { value: 'DOCUMENT', label: 'Document' },
                          ]}
                          ariaLabel="Select template header type"
                          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                        />
                      </div>

                      {createForm.headerType === 'TEXT' ? (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">Header text</label>
                          <input
                            type="text"
                            value={createForm.headerText}
                            onChange={(event) => setCreateForm((current) => ({ ...current, headerText: event.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            placeholder="Live Template Preview"
                          />
                        </div>
                      ) : null}

                      {hasMediaHeader ? (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Sample {getHeaderMediaKindLabel(createForm.headerType)} file
                          </label>
                          <input
                            ref={headerMediaInputRef}
                            type="file"
                            hidden
                            accept={getHeaderMediaAccept(createForm.headerType)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];

                              if (file) {
                                void handleHeaderMediaPicked(file);
                              }
                            }}
                          />
                          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {createForm.headerMediaFileName || `No ${getHeaderMediaKindLabel(createForm.headerType)} selected`}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {createForm.headerMediaMimeType || 'Choose a local file to upload as the Meta template header sample.'}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => headerMediaInputRef.current?.click()}
                                disabled={isBusy === 'header-media-upload'}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy === 'header-media-upload' ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <FileUp className="h-4 w-4" />
                                )}
                                {createForm.headerMediaPreviewUrl || createForm.headerMediaHandle ? 'Replace file' : 'Choose file'}
                              </button>
                              {createForm.headerMediaPreviewUrl || createForm.headerMediaHandle || createForm.headerMediaFileName ? (
                                <button
                                  type="button"
                                  onClick={removeHeaderMedia}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove file
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-gray-500">
                            The file is uploaded to Meta and used only as the template header sample for approval.
                          </p>
                        </div>
                      ) : null}

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="block text-sm font-medium text-gray-700">Body</label>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setIsEmojiOpen((current) => !current)} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50">
                              <Smile className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => insertIntoBody(applyWrapper('bold text', '*'))} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50">
                              <Bold className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => insertIntoBody(applyWrapper('italic text', '_'))} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50">
                              <Italic className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => insertIntoBody(applyWrapper('strikethrough', '~'))} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50">
                              <Strikethrough className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={addVariable} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                              Add variable
                            </button>
                          </div>
                        </div>

                        {isEmojiOpen ? (
                          <div className="mb-3 flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                            {EMOJI_CHOICES.map((emoji) => (
                              <button key={emoji} type="button" onClick={() => insertIntoBody(emoji)} className="rounded-lg bg-white px-3 py-2 text-lg hover:bg-gray-100">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <textarea
                          value={createForm.body}
                          onChange={(event) => setCreateForm((current) => ({ ...current, body: event.target.value }))}
                          className="min-h-[180px] w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          placeholder="Add Body to your Template Message."
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Footer (Optional)</label>
                        <input
                          type="text"
                          value={createForm.footer}
                          onChange={(event) => setCreateForm((current) => ({ ...current, footer: event.target.value }))}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          placeholder="Footer"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xl font-bold text-gray-900">Buttons (Optional)</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => addButton('URL')}
                          disabled={!canAddUrlButton}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Visit Website
                        </button>
                        <button
                          type="button"
                          onClick={() => addButton('QUICK_REPLY')}
                          disabled={!canAddQuickReplyButton}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Quick Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => addButton('FLOW')}
                          disabled={!canAddFlowButton}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Flow
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      Up to 1 URL button, 2 quick reply buttons, and 1 Flow button per template.
                    </p>

                    <div className="mt-5 space-y-4">
                      {createForm.buttons.length === 0 ? <p className="text-sm text-gray-500">No buttons added yet.</p> : null}
                      {createForm.buttons.map((button, index) => (
                        <div key={button.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              Button {index + 1}: {getTemplateButtonKindLabel(button)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCreateForm((current) => ({
                                  ...current,
                                  buttons: current.buttons.filter((entry) => entry.id !== button.id),
                                }))
                              }
                              className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-red-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input
                              type="text"
                              value={button.text}
                              maxLength={button.type === 'FLOW' ? MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH : undefined}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  buttons: current.buttons.map((entry) =>
                                    entry.id === button.id ? { ...entry, text: event.target.value } : entry,
                                  ),
                                }))
                              }
                              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                              placeholder={button.type === 'URL' ? 'Visit Website' : button.type === 'FLOW' ? 'Sign up' : 'Quick Reply'}
                            />
                            {button.type === 'URL' ? (
                              <input
                                type="url"
                                value={button.url}
                                onChange={(event) =>
                                  setCreateForm((current) => ({
                                    ...current,
                                    buttons: current.buttons.map((entry) =>
                                      entry.id === button.id ? { ...entry, url: event.target.value } : entry,
                                    ),
                                  }))
                                }
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                                placeholder="https://connektly.in"
                              />
                            ) : null}
                            {button.type === 'FLOW' ? (
                              <>
                                <DropdownSelect
                                  value={button.flowId}
                                  onChange={(nextFlowId) => {
                                    const flow = flows.find((item) => item.id === nextFlowId) || null;
                                    setCreateForm((current) => ({
                                      ...current,
                                      buttons: current.buttons.map((entry) =>
                                        entry.id === button.id && entry.type === 'FLOW'
                                          ? {
                                              ...entry,
                                              flowId: flow?.id || '',
                                              navigateScreen: getFlowEntryScreen(flow),
                                            }
                                          : entry,
                                      ),
                                    }));
                                  }}
                                  disabled={isFlowsLoading}
                                  options={[
                                    { value: '', label: isFlowsLoading ? 'Loading Flows...' : 'Select Flow' },
                                    ...flows.map((flow) => ({
                                      value: flow.id,
                                      label: `${flow.name} (${flow.status})`,
                                    })),
                                  ]}
                                  placeholder={isFlowsLoading ? 'Loading Flows...' : 'Select Flow'}
                                  ariaLabel="Select template Flow"
                                  buttonClassName="rounded-xl border-gray-200 bg-white px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15 disabled:opacity-60"
                                />
                                <DropdownSelect
                                  value={button.flowAction}
                                  onChange={(nextFlowAction) =>
                                    setCreateForm((current) => ({
                                      ...current,
                                      buttons: current.buttons.map((entry) =>
                                        entry.id === button.id && entry.type === 'FLOW'
                                          ? {
                                              ...entry,
                                              flowAction: nextFlowAction === 'data_exchange' ? 'data_exchange' : 'navigate',
                                            }
                                          : entry,
                                      ),
                                    }))
                                  }
                                  options={[
                                    { value: 'navigate', label: 'Navigate' },
                                    { value: 'data_exchange', label: 'Data exchange' },
                                  ]}
                                  ariaLabel="Select Flow button action"
                                  buttonClassName="rounded-xl border-gray-200 bg-white px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                                />
                                {button.flowAction === 'navigate' ? (
                                  <input
                                    type="text"
                                    value={button.navigateScreen}
                                    onChange={(event) =>
                                      setCreateForm((current) => ({
                                        ...current,
                                        buttons: current.buttons.map((entry) =>
                                          entry.id === button.id && entry.type === 'FLOW'
                                            ? { ...entry, navigateScreen: event.target.value }
                                            : entry,
                                        ),
                                      }))
                                    }
                                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                                    placeholder="FIRST_ENTRY_SCREEN"
                                  />
                                ) : null}
                                {!isFlowsLoading && !flows.length ? (
                                  <p className="md:col-span-2 text-sm text-gray-500">
                                    Create, sync, and publish a Flow before attaching one to a template.
                                  </p>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="flex justify-end gap-3 pb-2">
                    <button type="button" onClick={closeCreateModal} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isBusy === 'create' || isBusy === 'header-media-upload' || !hasConnectedChannel}
                      className="rounded-xl bg-[#5b45ff] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 disabled:opacity-60"
                    >
                      {isBusy === 'create' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
                      Create template
                    </button>
                  </div>
                </div>
                <div className="hidden min-h-0 overflow-y-auto border-l border-gray-100 bg-[#f4f4f2] p-6 lg:block">
                  <p className="mb-4 text-center text-2xl font-bold text-gray-700">Preview</p>
                  <div className="mx-auto w-[320px] rounded-[2.4rem] bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
                    <div className="rounded-[2rem] border border-gray-100 bg-[#f7f7f5] p-4">
                      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
                        <div className="flex items-center gap-2">
                          <ChannelBrandIcon channel="whatsapp" className="h-10 w-10 shrink-0" alt="" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Connektly</p>
                            <p className="text-[11px] text-gray-500">{selectedLanguageLabel}</p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">12:04</div>
                      </div>

                      <div className="mb-4 rounded-2xl bg-[#dff3f2] px-4 py-3 text-xs text-[#52656f]">
                        This business uses a secure service from Meta to manage this chat. Tap to learn more
                      </div>

                      <div className="rounded-[1.6rem] bg-white p-5 shadow-sm">
                        {createForm.headerType === 'TEXT' && createForm.headerText ? (
                          <p className="mb-4 text-[1.05rem] font-bold text-gray-900">{createForm.headerText}</p>
                        ) : null}
                        {hasMediaHeader ? (
                          <HeaderMediaPreview
                            headerType={createForm.headerType}
                            previewUrl={createForm.headerMediaPreviewUrl}
                            fileName={createForm.headerMediaFileName}
                            mimeType={createForm.headerMediaMimeType}
                          />
                        ) : null}
                        <p className="whitespace-pre-wrap text-[1.05rem] leading-8 text-gray-900">
                          {createForm.body || 'Add Body to your Template Message.'}
                        </p>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-sm text-gray-500">{createForm.footer || 'Footer'}</p>
                          <span className="text-sm text-gray-400">12:04</span>
                        </div>

                        {createForm.buttons.length > 0 ? (
                          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                            {createForm.buttons.map((button) => (
                              <div key={button.id} className="text-center text-[1rem] font-medium text-[#4e8ed8]">
                                {button.type === 'URL' ? '↗ ' : '↩ '}
                                {button.text || (button.type === 'URL' ? 'Visit Website' : button.type === 'FLOW' ? 'Open Flow' : 'Quick Reply')}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </form>
                </motion.div>
              </div>
                </div>
              ) : null}
            </AnimatePresence>,
            modalRoot,
          )
        : null}
    </div>
  );
}
