import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  BadgeCheck,
  Eye,
  FileText,
  Loader2,
  Mail,
  PencilLine,
  PlusCircle,
  RefreshCcw,
  Save,
  Search,
  Send,
  Server,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import { useAppData } from '../../context/AppDataContext';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type {
  EmailCampaign,
  EmailCampaignAudienceSource,
  EmailConnectionSummary,
  EmailConnectionUpsertInput,
  EmailConnectionVerifyResponse,
  EmailMessage,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateEditorMode,
} from '../../lib/types';

interface EmailConnectionFormState {
  displayName: string;
  emailAddress: string;
  authUser: string;
  password: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
}

interface EmailTemplateDraft {
  name: string;
  subject: string;
  editorMode: EmailTemplateEditorMode;
  htmlContent: string;
}

const DEFAULT_TEMPLATE_HTML = [
  '<h2>Hello there,</h2>',
  '<p>Start building your campaign here.</p>',
  '<p>Use the rich editor or switch to HTML mode whenever you need direct control.</p>',
].join('');

function buildConnectionForm(
  connection: EmailConnectionSummary | null,
  fallbackDisplayName: string,
  fallbackEmailAddress: string,
): EmailConnectionFormState {
  return {
    displayName: connection?.displayName || fallbackDisplayName,
    emailAddress: connection?.emailAddress || fallbackEmailAddress,
    authUser: connection?.authUser || connection?.emailAddress || fallbackEmailAddress,
    password: '',
    smtpHost: connection?.smtpHost || '',
    smtpPort: connection?.smtpPort ? String(connection.smtpPort) : '465',
    smtpSecure: connection?.smtpSecure ?? true,
    imapHost: connection?.imapHost || '',
    imapPort: connection?.imapPort ? String(connection.imapPort) : '993',
    imapSecure: connection?.imapSecure ?? true,
  };
}

function buildTemplateDraft(template?: EmailTemplate | null): EmailTemplateDraft {
  return {
    name: template?.name || '',
    subject: template?.subject || '',
    editorMode: template?.editorMode || 'rich',
    htmlContent: template?.htmlContent || DEFAULT_TEMPLATE_HTML,
  };
}

function normalizeEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function parseCustomRecipients(value: string) {
  const deduped = new Map<string, EmailRecipient>();
  const lines = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const line of lines) {
    const angleMatch = line.match(/^(.*)<([^>]+)>$/);

    if (angleMatch) {
      const email = normalizeEmail(angleMatch[2] || '');

      if (email) {
        deduped.set(email, {
          email,
          name: angleMatch[1].trim() || null,
        });
      }
      continue;
    }

    if (line.includes(',')) {
      const [first, second] = line.split(',', 2);
      const email = normalizeEmail(second || '');

      if (email) {
        deduped.set(email, {
          email,
          name: first.trim() || null,
        });
        continue;
      }
    }

    const email = normalizeEmail(line);

    if (email) {
      deduped.set(email, { email, name: null });
    }
  }

  return Array.from(deduped.values());
}

function buildConnectionPayload(form: EmailConnectionFormState): EmailConnectionUpsertInput {
  return {
    displayName: form.displayName.trim(),
    emailAddress: form.emailAddress.trim(),
    authUser: form.authUser.trim(),
    password: form.password,
    smtpHost: form.smtpHost.trim(),
    smtpPort: Number(form.smtpPort),
    smtpSecure: form.smtpSecure,
    imapHost: form.imapHost.trim(),
    imapPort: Number(form.imapPort),
    imapSecure: form.imapSecure,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function buildEmailPreviewDocument(html: string) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          padding: 20px;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #111827;
          background: #ffffff;
          line-height: 1.6;
          word-break: break-word;
        }
        img, table {
          max-width: 100%;
        }
        a {
          color: #4f46e5;
        }
      </style>
    </head>
    <body>${html}</body>
  </html>`;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 18 }}
        className="relative z-10 max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/40 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-6">{children}</div>
      </motion.div>
    </div>
  );
}

function TextPromptDialog({
  isOpen,
  title,
  description,
  label,
  value,
  placeholder,
  isSubmitting = false,
  onChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  label: string;
  value: string;
  placeholder?: string;
  isSubmitting?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEscapeKey(isOpen && !isSubmitting, onClose);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <motion.button
        type="button"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={isSubmitting ? undefined : onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 18 }}
        className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
          <input
            type="url"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
          />
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || !value.trim()}
            className="inline-flex items-center justify-center rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Insert link
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function VerificationCard({
  label,
  result,
  isLoading,
}: {
  label: string;
  result: EmailConnectionVerifyResponse['smtp'] | null;
  isLoading: boolean;
}) {
  const ok = result?.ok;

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {isLoading ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking
          </span>
        ) : result ? (
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
              ok
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            {ok ? 'Verified' : 'Error'}
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
            Waiting
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        {result?.message || 'Fill out the setup form to verify this connection.'}
      </p>
      {result?.latencyMs ? (
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
          {result.latencyMs} ms
        </p>
      ) : null}
    </div>
  );
}

function RichTextEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (nextHtml: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = useState('');

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  const applyCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    onChange(editorRef.current?.innerHTML || '');
  };

  const handleInsertLink = () => {
    const normalizedUrl = linkUrlDraft.trim();

    if (!normalizedUrl) {
      return;
    }

    applyCommand('createLink', normalizedUrl);
    setLinkUrlDraft('');
    setIsLinkDialogOpen(false);
  };

  return (
    <>
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          {[
            { label: 'Bold', command: 'bold' },
            { label: 'Italic', command: 'italic' },
            { label: 'Underline', command: 'underline' },
            { label: 'Bullet', command: 'insertUnorderedList' },
          ].map((action) => (
            <button
              key={action.command}
              type="button"
              onClick={() => applyCommand(action.command)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsLinkDialogOpen(true)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Link
          </button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange(editorRef.current?.innerHTML || '')}
          className="min-h-[280px] bg-white px-5 py-4 text-sm leading-7 text-gray-800 outline-none"
        />
      </div>

      <AnimatePresence>
        <TextPromptDialog
          isOpen={isLinkDialogOpen}
          title="Insert link"
          description="Add the URL you want to attach to the selected text in this email."
          label="URL"
          value={linkUrlDraft}
          placeholder="https://example.com"
          onChange={setLinkUrlDraft}
          onClose={() => {
            setIsLinkDialogOpen(false);
            setLinkUrlDraft('');
          }}
          onSubmit={handleInsertLink}
        />
      </AnimatePresence>
    </>
  );
}

export default function Emails() {
  const { bootstrap } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connection, setConnection] = useState<EmailConnectionSummary | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isLoadingConnection, setIsLoadingConnection] = useState(true);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [connectionForm, setConnectionForm] = useState<EmailConnectionFormState>(() =>
    buildConnectionForm(null, bootstrap?.profile?.fullName || '', bootstrap?.profile?.email || ''),
  );
  const [verification, setVerification] = useState<EmailConnectionVerifyResponse | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isVerifyingConnection, setIsVerifyingConnection] = useState(false);
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [isDeletingConnection, setIsDeletingConnection] = useState(false);
  const [isDisconnectConfirmationOpen, setIsDisconnectConfirmationOpen] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignNotice, setCampaignNotice] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);
  const [isDeletingTemplateId, setIsDeletingTemplateId] = useState<string | null>(null);
  const [pendingTemplateDelete, setPendingTemplateDelete] = useState<EmailTemplate | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [templateDraft, setTemplateDraft] = useState<EmailTemplateDraft>(() => buildTemplateDraft(null));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [audienceSource, setAudienceSource] = useState<EmailCampaignAudienceSource>('contacts');
  const [selectedContactEmails, setSelectedContactEmails] = useState<string[]>([]);
  const [customRecipientList, setCustomRecipientList] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [campaignContactSearch, setCampaignContactSearch] = useState('');
  const emailView = location.pathname.endsWith('/template-builder') ? 'template-builder' : 'inbox';

  const campaignContactSearchDeferred = useDeferredValue(campaignContactSearch);
  const activeMessage = useMemo(
    () => messages.find((message) => message.id === selectedMessageId) || messages[0] || null,
    [messages, selectedMessageId],
  );
  const connectionFormIsComplete = useMemo(() => {
    return Boolean(
      connectionForm.displayName.trim() &&
        connectionForm.emailAddress.trim() &&
        connectionForm.authUser.trim() &&
        connectionForm.password &&
        connectionForm.smtpHost.trim() &&
        connectionForm.smtpPort.trim() &&
        connectionForm.imapHost.trim() &&
        connectionForm.imapPort.trim(),
    );
  }, [connectionForm]);

  const contactEmailOptions = useMemo(() => {
    const map = new Map<string, { email: string; name: string; detail: string }>();

    for (const contact of bootstrap?.conversations || []) {
      const email = normalizeEmail(contact.email || '');

      if (!email) {
        continue;
      }

      map.set(email, {
        email,
        name: contact.contactName || contact.displayPhone || email,
        detail: contact.displayPhone || contact.contactWaId || email,
      });
    }

    return Array.from(map.values());
  }, [bootstrap?.conversations]);

  const filteredContactEmailOptions = useMemo(() => {
    const query = campaignContactSearchDeferred.trim().toLowerCase();

    if (!query) {
      return contactEmailOptions;
    }

    return contactEmailOptions.filter((entry) =>
      [entry.name, entry.email, entry.detail].some((value) => value.toLowerCase().includes(query)),
    );
  }, [contactEmailOptions, campaignContactSearchDeferred]);

  const selectedRecipients = useMemo(() => {
    if (audienceSource === 'custom') {
      return parseCustomRecipients(customRecipientList);
    }

    const selectedSet = new Set(selectedContactEmails);

    return contactEmailOptions
      .filter((entry) => selectedSet.has(entry.email))
      .map((entry) => ({ email: entry.email, name: entry.name }));
  }, [audienceSource, contactEmailOptions, customRecipientList, selectedContactEmails]);

  const loadConnection = async () => {
    try {
      setIsLoadingConnection(true);
      const response = await appApi.getEmailConnection();
      setConnection(response.connection);
      setConnectionForm(
        buildConnectionForm(
          response.connection,
          bootstrap?.profile?.fullName || '',
          bootstrap?.profile?.email || '',
        ),
      );
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to load email connection.');
    } finally {
      setIsLoadingConnection(false);
    }
  };

  const loadWorkspace = async () => {
    if (!connection) {
      return;
    }

    try {
      setIsLoadingWorkspace(true);
      setPageError(null);
      const [inboxResponse, templatesResponse, campaignsResponse] = await Promise.all([
        appApi.getEmailInbox(),
        appApi.getEmailTemplates(),
        appApi.getEmailCampaigns(),
      ]);
      setMessages(inboxResponse.messages);
      setSelectedMessageId((current) => current || inboxResponse.messages[0]?.id || null);
      setTemplates(templatesResponse.templates);
      setCampaigns(campaignsResponse.campaigns);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to load email workspace.');
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    void loadConnection();
  }, []);

  useEffect(() => {
    if (searchParams.get('setup') === '1') {
      navigate('/dashboard/channels?channel=email&setup=1', { replace: true });
    }
  }, [navigate, searchParams]);

  useEffect(() => {
    if (emailView === 'template-builder' && connection) {
      setIsCampaignOpen(true);
      return;
    }

    if (emailView === 'inbox') {
      setIsCampaignOpen(false);
    }
  }, [connection, emailView]);

  useEffect(() => {
    if (!connection) {
      setMessages([]);
      setTemplates([]);
      setCampaigns([]);
      return;
    }

    void loadWorkspace();
  }, [connection]);

  useEffect(() => {
    if (!isSetupOpen) {
      return;
    }

    if (!connectionFormIsComplete) {
      setVerification(null);
      setVerificationError(null);
      setIsVerifyingConnection(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsVerifyingConnection(true);
        setVerificationError(null);
        const response = await appApi.verifyEmailConnection(buildConnectionPayload(connectionForm));

        if (!cancelled) {
          setVerification(response);
        }
      } catch (error) {
        if (!cancelled) {
          setVerification(null);
          setVerificationError(
            error instanceof Error ? error.message : 'Connection verification failed.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsVerifyingConnection(false);
        }
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [connectionForm, connectionFormIsComplete, isSetupOpen]);

  useEffect(() => {
    if (!activeMessage) {
      return;
    }

    setSelectedMessageId(activeMessage.id);
  }, [activeMessage]);

  const closeSetupModal = () => {
    setIsSetupOpen(false);
    setVerificationError(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('setup');
      return next;
    });
  };

  const openSetupModal = () => {
    navigate('/dashboard/channels?channel=email&setup=1');
  };

  const handleSaveConnection = async () => {
    try {
      setIsSavingConnection(true);
      setPageError(null);
      setPageNotice(null);
      const response = await appApi.saveEmailConnection(buildConnectionPayload(connectionForm));
      setConnection(response.connection);
      setPageNotice('Email account connected successfully.');
      closeSetupModal();
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Failed to connect email.');
    } finally {
      setIsSavingConnection(false);
    }
  };

  const handleDeleteConnection = () => {
    if (!connection) {
      return;
    }

    setIsDisconnectConfirmationOpen(true);
  };

  const confirmDeleteConnection = async () => {
    try {
      setIsDeletingConnection(true);
      setPageError(null);
      setPageNotice(null);
      await appApi.deleteEmailConnection();
      setConnection(null);
      setMessages([]);
      setTemplates([]);
      setCampaigns([]);
      setSelectedMessageId(null);
      setPageNotice('Email account disconnected.');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to disconnect email.');
    } finally {
      setIsDeletingConnection(false);
      setIsDisconnectConfirmationOpen(false);
    }
  };

  const openCampaignComposer = () => {
    setCampaignError(null);
    setCampaignNotice(null);
    setCampaignName('');
    setSelectedTemplateId(null);
    setTemplateDraft(buildTemplateDraft(null));
    setAudienceSource('contacts');
    setSelectedContactEmails([]);
    setCustomRecipientList('');
    setCampaignContactSearch('');
    setIsCampaignOpen(true);

    if (emailView !== 'template-builder') {
      navigate('/dashboard/emails/template-builder');
    }
  };

  const closeCampaignComposer = () => {
    if (emailView === 'template-builder') {
      navigate('/dashboard/emails/inbox');
      return;
    }

    setIsCampaignOpen(false);
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplateId(template.id);
    setTemplateDraft(buildTemplateDraft(template));
  };

  const updateTemplateDraft = <Key extends keyof EmailTemplateDraft>(
    key: Key,
    value: EmailTemplateDraft[Key],
  ) => {
    setTemplateDraft((current) => ({ ...current, [key]: value }));

    if (selectedTemplateId) {
      setSelectedTemplateId(null);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      setIsSavingTemplate(true);
      setCampaignError(null);
      const response = await appApi.saveEmailTemplate({
        name: templateDraft.name,
        subject: templateDraft.subject,
        editorMode: templateDraft.editorMode,
        htmlContent: templateDraft.htmlContent,
      });
      setTemplates((current) => [response.template, ...current.filter((item) => item.id !== response.template.id)]);
      setSelectedTemplateId(response.template.id);
      setTemplateDraft(buildTemplateDraft(response.template));
      setCampaignNotice('Template saved and ready for this campaign.');
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : 'Failed to save email template.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = (template: EmailTemplate) => {
    setPendingTemplateDelete(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!pendingTemplateDelete) {
      return;
    }

    const templateId = pendingTemplateDelete.id;

    try {
      setIsDeletingTemplateId(templateId);
      setCampaignError(null);
      await appApi.deleteEmailTemplate(templateId);
      setTemplates((current) => current.filter((template) => template.id !== templateId));

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
        setTemplateDraft(buildTemplateDraft(null));
      }
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : 'Failed to delete email template.');
    } finally {
      setIsDeletingTemplateId(null);
      setPendingTemplateDelete(null);
    }
  };

  const handleSendCampaign = async () => {
    if (!selectedTemplateId) {
      setCampaignError('Save the email template first before sending the campaign.');
      return;
    }

    if (!campaignName.trim()) {
      setCampaignError('Campaign name is required.');
      return;
    }

    if (selectedRecipients.length === 0) {
      setCampaignError('Choose at least one recipient.');
      return;
    }

    try {
      setIsSendingCampaign(true);
      setCampaignError(null);
      const response = await appApi.sendEmailCampaign({
        templateId: selectedTemplateId,
        campaignName: campaignName.trim(),
        audienceSource,
        recipients: selectedRecipients,
      });
      setCampaigns((current) => [response.campaign, ...current]);
      closeCampaignComposer();
      setPageNotice(
        response.campaign.status === 'sent'
          ? 'Email campaign sent successfully.'
          : response.campaign.status === 'partial'
            ? 'Email campaign sent partially. Some recipients could not be reached.'
            : 'Email campaign could not be delivered.',
      );
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : 'Failed to send the email campaign.');
    } finally {
      setIsSendingCampaign(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emails</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect an inbox over SMTP and IMAP, review incoming emails, and launch saved email campaigns.
          </p>
        </div>

        {connection ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              disabled={isLoadingWorkspace}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              {isLoadingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh Inbox
            </button>
            <button
              type="button"
              onClick={openSetupModal}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Server className="h-4 w-4" />
              Manage Connection
            </button>
            <button
              type="button"
              onClick={openCampaignComposer}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4a35e8]"
            >
              <PlusCircle className="h-4 w-4" />
              New Email Campaign
            </button>
          </div>
        ) : null}
      </div>

      <FeedbackPopupStack
        items={[
          ...(pageError ? [{ id: 'emails-error', tone: 'error' as const, message: pageError, onDismiss: () => setPageError(null) }] : []),
          ...(pageNotice ? [{ id: 'emails-notice', tone: 'success' as const, message: pageNotice, onDismiss: () => setPageNotice(null) }] : []),
        ]}
      />

      {isLoadingConnection ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-gray-200 bg-white shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
        </div>
      ) : !connection ? (
        <div className="flex min-h-[340px] items-center justify-center rounded-3xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={openSetupModal}
            className="inline-flex items-center gap-3 rounded-2xl bg-[#5b45ff] px-6 py-4 text-base font-semibold text-white transition hover:bg-[#4a35e8]"
          >
            <Mail className="h-5 w-5" />
            Connect your Email to get started
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Connected inbox</p>
              <p className="mt-3 text-lg font-bold text-gray-900">{connection.emailAddress}</p>
              <p className="mt-1 text-sm text-gray-500">{connection.displayName}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Connection status</p>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    connection.status === 'connected'
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-amber-100 bg-amber-50 text-amber-700'
                  }`}
                >
                  {connection.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500">Last verified {formatDateTime(connection.lastVerifiedAt)}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Transport</p>
                  <p className="mt-3 text-sm font-semibold text-gray-900">
                    SMTP {connection.smtpHost}:{connection.smtpPort}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    IMAP {connection.imapHost}:{connection.imapPort}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteConnection}
                  disabled={isDeletingConnection}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                >
                  {isDeletingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Disconnect
                </button>
              </div>
            </div>
          </div>

          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <h2 className="text-lg font-bold text-gray-900">Inbox</h2>
              <p className="mt-1 text-sm text-gray-500">
                Incoming emails are loaded live from your IMAP inbox with rich text preview support.
              </p>
            </div>

            {isLoadingWorkspace ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
              </div>
            ) : (
              <div className="grid min-h-[520px] gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
                <div className="border-r border-gray-100">
                  <div className="border-b border-gray-100 px-4 py-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={inboxSearch}
                        onChange={(event) => setInboxSearch(event.target.value)}
                        placeholder="Search emails"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </div>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto">
                    {messages
                      .filter((message) => {
                        const query = inboxSearch.trim().toLowerCase();

                        if (!query) {
                          return true;
                        }

                        return [message.subject, message.fromName || '', message.fromEmail || '', message.previewText]
                          .some((value) => value.toLowerCase().includes(query));
                      })
                      .map((message) => (
                        <button
                          key={message.id}
                          type="button"
                          onClick={() => setSelectedMessageId(message.id)}
                          className={`w-full border-b border-gray-100 px-4 py-4 text-left transition hover:bg-gray-50 ${
                            activeMessage?.id === message.id ? 'bg-[#f5f3ff]' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">{message.subject}</p>
                              <p className="mt-1 truncate text-xs text-gray-500">
                                {message.fromName || message.fromEmail || 'Unknown sender'}
                              </p>
                            </div>
                            {message.isUnread ? (
                              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#5b45ff]" />
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{message.previewText}</p>
                          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
                            {formatDateTime(message.receivedAt)}
                          </p>
                        </button>
                      ))}

                    {messages.length === 0 ? (
                      <div className="px-6 py-16 text-center">
                        <Mail className="mx-auto h-10 w-10 text-gray-300" />
                        <p className="mt-4 text-sm font-semibold text-gray-900">Inbox is empty</p>
                        <p className="mt-2 text-sm text-gray-500">
                          New incoming emails will appear here once your IMAP inbox receives them.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex min-h-[520px] flex-col">
                  {activeMessage ? (
                    <>
                      <div className="border-b border-gray-100 px-6 py-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{activeMessage.subject}</h3>
                            <p className="mt-2 text-sm text-gray-500">
                              From {activeMessage.fromName || activeMessage.fromEmail || 'Unknown sender'}
                            </p>
                            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                              {formatDateTime(activeMessage.receivedAt)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Recipients</p>
                            <p className="mt-2 text-sm font-medium text-gray-900">
                              {activeMessage.to.join(', ') || 'Not available'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 overflow-hidden bg-[#f8fafc] p-6">
                        {activeMessage.htmlBody ? (
                          <iframe
                            title={activeMessage.subject}
                            sandbox=""
                            srcDoc={buildEmailPreviewDocument(activeMessage.htmlBody)}
                            className="h-full min-h-[360px] w-full rounded-3xl border border-gray-200 bg-white"
                          />
                        ) : (
                          <div className="h-full min-h-[360px] overflow-auto rounded-3xl border border-gray-200 bg-white p-6">
                            <pre className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
                              {activeMessage.textBody || 'No message body available.'}
                            </pre>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center px-6 text-center">
                      <div>
                        <Eye className="mx-auto h-10 w-10 text-gray-300" />
                        <p className="mt-4 text-sm font-semibold text-gray-900">Select an email</p>
                        <p className="mt-2 text-sm text-gray-500">Choose an email from the inbox to preview it here.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Saved Templates</h2>
                  <p className="mt-1 text-sm text-gray-500">Templates saved from your campaign flow stay here for reuse.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {templates.length} saved
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {templates.length > 0 ? (
                  templates.map((template) => (
                    <div key={template.id} className="flex items-start justify-between gap-4 px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                        <p className="mt-1 text-sm text-gray-500">{template.subject}</p>
                        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
                          {template.editorMode} mode
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isCampaignOpen) {
                              setIsCampaignOpen(true);
                            }
                            handleSelectTemplate(template);
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          Use
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(template)}
                          disabled={isDeletingTemplateId === template.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {isDeletingTemplateId === template.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-14 text-center">
                    <FileText className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-4 text-sm font-semibold text-gray-900">No saved templates yet</p>
                    <p className="mt-2 text-sm text-gray-500">
                      Create one from a new email campaign and it will stay available here.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Recent Campaigns</h2>
                  <p className="mt-1 text-sm text-gray-500">Track the campaigns sent from this workspace.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {campaigns.length} campaigns
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {campaigns.length > 0 ? (
                  campaigns.map((campaign) => (
                    <div key={campaign.id} className="px-6 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{campaign.campaignName}</p>
                          <p className="mt-1 text-sm text-gray-500">{campaign.subject}</p>
                          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
                            Sent {formatDateTime(campaign.sentAt || campaign.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                              campaign.status === 'sent'
                                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                : campaign.status === 'partial'
                                  ? 'border-amber-100 bg-amber-50 text-amber-700'
                                  : 'border-red-100 bg-red-50 text-red-700'
                            }`}
                          >
                            {campaign.status}
                          </span>
                          <p className="mt-2 text-sm text-gray-600">{campaign.recipientCount} recipients</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-14 text-center">
                    <Send className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-4 text-sm font-semibold text-gray-900">No campaigns yet</p>
                    <p className="mt-2 text-sm text-gray-500">
                      Launch your first email campaign to start building history here.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <AnimatePresence>
        {isSetupOpen ? (
          <ModalShell
            title="Connect Email Account"
            subtitle="Set up your SMTP and IMAP credentials once, then Connektly can verify the connection and load your inbox."
            onClose={closeSetupModal}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-gray-200 bg-[#fcfcfd] p-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Display Name</span>
                      <input
                        type="text"
                        value={connectionForm.displayName}
                        onChange={(event) => setConnectionForm((current) => ({ ...current, displayName: event.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Email Address</span>
                      <input
                        type="email"
                        value={connectionForm.emailAddress}
                        onChange={(event) => setConnectionForm((current) => ({ ...current, emailAddress: event.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">SMTP / IMAP Username</span>
                      <input
                        type="text"
                        value={connectionForm.authUser}
                        onChange={(event) => setConnectionForm((current) => ({ ...current, authUser: event.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Password</span>
                      <input
                        type="password"
                        value={connectionForm.password}
                        onChange={(event) => setConnectionForm((current) => ({ ...current, password: event.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="mb-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">SMTP</p>
                      <h3 className="mt-2 text-xl font-bold text-gray-900">Outgoing mail</h3>
                    </div>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">SMTP Host</span>
                        <input
                          type="text"
                          value={connectionForm.smtpHost}
                          onChange={(event) => setConnectionForm((current) => ({ ...current, smtpHost: event.target.value }))}
                          placeholder="smtp.example.com"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Port</span>
                          <input
                            type="number"
                            value={connectionForm.smtpPort}
                            onChange={(event) => setConnectionForm((current) => ({ ...current, smtpPort: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                        <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={connectionForm.smtpSecure}
                            onChange={(event) => setConnectionForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                          />
                          Secure connection
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="mb-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">IMAP</p>
                      <h3 className="mt-2 text-xl font-bold text-gray-900">Incoming mail</h3>
                    </div>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">IMAP Host</span>
                        <input
                          type="text"
                          value={connectionForm.imapHost}
                          onChange={(event) => setConnectionForm((current) => ({ ...current, imapHost: event.target.value }))}
                          placeholder="imap.example.com"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Port</span>
                          <input
                            type="number"
                            value={connectionForm.imapPort}
                            onChange={(event) => setConnectionForm((current) => ({ ...current, imapPort: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                        <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={connectionForm.imapSecure}
                            onChange={(event) => setConnectionForm((current) => ({ ...current, imapSecure: event.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                          />
                          Secure connection
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {verificationError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {verificationError}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSaveConnection()}
                    disabled={!verification?.canConnect || isSavingConnection || isVerifyingConnection}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Connect Email Account
                  </button>
                  <button
                    type="button"
                    onClick={closeSetupModal}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <VerificationCard
                  label="SMTP status"
                  result={verification?.smtp || null}
                  isLoading={isVerifyingConnection}
                />
                <VerificationCard
                  label="IMAP status"
                  result={verification?.imap || null}
                  isLoading={isVerifyingConnection}
                />
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Setup flow</p>
                  <p className="mt-3 text-sm leading-7 text-gray-600">
                    As you fill the form, Connektly verifies SMTP and IMAP in real time. When both are healthy, the connection can be saved once and reused for inbox access and campaigns.
                  </p>
                </div>
              </div>
            </div>
          </ModalShell>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isCampaignOpen ? (
          <ModalShell
            title="New Email Campaign"
            subtitle="Create or choose a saved template, pick the audience, and send one email campaign to multiple recipients."
            onClose={closeCampaignComposer}
          >
            <div className="space-y-6">
              {campaignError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {campaignError}
                </div>
              ) : null}

              {campaignNotice ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {campaignNotice}
                </div>
              ) : null}

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Campaign Name</span>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(event) => setCampaignName(event.target.value)}
                      placeholder="April Product Update"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Audience</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {selectedRecipients.length} recipient{selectedRecipients.length === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">Save the template first, then send to the selected list.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Saved Templates</p>
                      <h3 className="mt-2 text-lg font-bold text-gray-900">Use existing</h3>
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      {templates.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {templates.length > 0 ? (
                      templates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleSelectTemplate(template)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selectedTemplateId === template.id
                              ? 'border-[#5b45ff] bg-[#f5f3ff]'
                              : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{template.subject}</p>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                        No saved templates yet
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Step 1</p>
                        <h3 className="mt-2 text-xl font-bold text-gray-900">Build the email template</h3>
                        <p className="mt-2 text-sm text-gray-500">
                          Create the template in a rich editor or switch to direct HTML. Save it before sending so it stays available for future campaigns.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateTemplateDraft('editorMode', 'rich')}
                          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                            templateDraft.editorMode === 'rich'
                              ? 'bg-[#5b45ff] text-white'
                              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Rich Text
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTemplateDraft('editorMode', 'html')}
                          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                            templateDraft.editorMode === 'html'
                              ? 'bg-[#5b45ff] text-white'
                              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          HTML
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Template Name</span>
                        <input
                          type="text"
                          value={templateDraft.name}
                          onChange={(event) => updateTemplateDraft('name', event.target.value)}
                          placeholder="Monthly Newsletter"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Email Subject</span>
                        <input
                          type="text"
                          value={templateDraft.subject}
                          onChange={(event) => updateTemplateDraft('subject', event.target.value)}
                          placeholder="Your April update is here"
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                    </div>

                    <div className="mt-5">
                      {templateDraft.editorMode === 'rich' ? (
                        <RichTextEditor
                          html={templateDraft.htmlContent}
                          onChange={(nextHtml) => updateTemplateDraft('htmlContent', nextHtml)}
                        />
                      ) : (
                        <textarea
                          value={templateDraft.htmlContent}
                          onChange={(event) => updateTemplateDraft('htmlContent', event.target.value)}
                          rows={16}
                          className="w-full rounded-3xl border border-gray-200 bg-gray-50 px-4 py-4 font-mono text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleSaveTemplate()}
                        disabled={isSavingTemplate}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#111827] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:opacity-60"
                      >
                        {isSavingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Template
                      </button>
                      {selectedTemplateId ? (
                        <span className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                          <BadgeCheck className="h-4 w-4" />
                          Ready to send
                        </span>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Step 2</p>
                    <h3 className="mt-2 text-xl font-bold text-gray-900">Choose the audience</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Send to saved contacts with email addresses or build a custom list for this campaign.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setAudienceSource('contacts')}
                        className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                          audienceSource === 'contacts'
                            ? 'bg-[#5b45ff] text-white'
                            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Users className="mr-2 inline h-4 w-4" />
                        Select Contacts
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudienceSource('custom')}
                        className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                          audienceSource === 'custom'
                            ? 'bg-[#5b45ff] text-white'
                            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <PencilLine className="mr-2 inline h-4 w-4" />
                        Custom Email List
                      </button>
                    </div>

                    {audienceSource === 'contacts' ? (
                      <div className="mt-5 space-y-4">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={campaignContactSearch}
                            onChange={(event) => setCampaignContactSearch(event.target.value)}
                            placeholder="Search contacts with email addresses"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </div>

                        <div className="max-h-[280px] overflow-y-auto rounded-3xl border border-gray-200">
                          {filteredContactEmailOptions.length > 0 ? (
                            filteredContactEmailOptions.map((entry) => {
                              const selected = selectedContactEmails.includes(entry.email);

                              return (
                                <label
                                  key={entry.email}
                                  className={`flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 ${
                                    selected ? 'bg-[#f5f3ff]' : 'hover:bg-gray-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      setSelectedContactEmails((current) =>
                                        selected
                                          ? current.filter((email) => email !== entry.email)
                                          : [...current, entry.email],
                                      )
                                    }
                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                                  />
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-900">{entry.name}</p>
                                    <p className="mt-1 text-xs text-gray-500">{entry.email}</p>
                                    <p className="mt-1 text-xs text-gray-400">{entry.detail}</p>
                                  </div>
                                </label>
                              );
                            })
                          ) : (
                            <div className="px-4 py-10 text-center text-sm text-gray-500">
                              No contacts with email addresses are available.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <textarea
                          value={customRecipientList}
                          onChange={(event) => setCustomRecipientList(event.target.value)}
                          rows={8}
                          placeholder={'one@example.com\nAlex Doe,alex@example.com\nTaylor <taylor@example.com>'}
                          className="w-full rounded-3xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                        <p className="mt-3 text-xs text-gray-500">
                          Add one email per line, use <code className="rounded bg-gray-100 px-1 py-0.5">Name,email@example.com</code>, or <code className="rounded bg-gray-100 px-1 py-0.5">Name &lt;email@example.com&gt;</code>.
                        </p>
                      </div>
                    )}
                  </section>

                  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Step 3</p>
                        <h3 className="mt-2 text-xl font-bold text-gray-900">Send to multiple recipients</h3>
                        <p className="mt-2 text-sm text-gray-500">
                          Template: {selectedTemplateId ? 'Saved and selected' : 'Save the template first'}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSendCampaign()}
                        disabled={isSendingCampaign}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#4a35e8] disabled:opacity-60"
                      >
                        {isSendingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send Email Campaign
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </ModalShell>
        ) : null}
      </AnimatePresence>

      <ConfirmationDialog
        isOpen={isDisconnectConfirmationOpen}
        title="Disconnect email account?"
        description={
          connection?.emailAddress
            ? `${connection.emailAddress} will be removed from this workspace until you connect it again.`
            : 'This email account will be removed from the workspace until you connect it again.'
        }
        confirmLabel="Disconnect account"
        tone="danger"
        isLoading={isDeletingConnection}
        onClose={() => setIsDisconnectConfirmationOpen(false)}
        onConfirm={() => void confirmDeleteConnection()}
      />

      <ConfirmationDialog
        isOpen={Boolean(pendingTemplateDelete)}
        title="Delete saved email template?"
        description={
          pendingTemplateDelete
            ? `The template "${pendingTemplateDelete.name}" will be permanently removed from your saved templates.`
            : ''
        }
        confirmLabel="Delete template"
        tone="danger"
        isLoading={Boolean(pendingTemplateDelete && isDeletingTemplateId === pendingTemplateDelete.id)}
        onClose={() => setPendingTemplateDelete(null)}
        onConfirm={() => void confirmDeleteTemplate()}
      />
    </div>
  );
}
