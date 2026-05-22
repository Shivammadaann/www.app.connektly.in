import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Archive,
  Ban,
  ExternalLink,
  FileText,
  Forward,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import type { EmailConnectionSummary, EmailMessage } from '../../lib/types';

type MailFolderId = 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash' | 'archive';

type MailFolder = {
  id: MailFolderId;
  label: string;
  icon: typeof InboxIcon;
};

const mailFolders: MailFolder[] = [
  { id: 'inbox', label: 'Inbox', icon: InboxIcon },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'spam', label: 'Spam', icon: Ban },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'archive', label: 'Archive', icon: Archive },
];

const pageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.035 },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

function normalizeFolder(value: string | null | undefined): MailFolderId {
  const normalized = String(value || '').toLowerCase();

  if (normalized.includes('draft')) return 'drafts';
  if (normalized.includes('sent')) return 'sent';
  if (normalized.includes('spam') || normalized.includes('junk')) return 'spam';
  if (normalized.includes('trash') || normalized.includes('bin')) return 'trash';
  if (normalized.includes('archive')) return 'archive';

  return 'inbox';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailPreviewDocument(message: EmailMessage | null) {
  const htmlBody = message?.htmlBody?.trim();
  const textBody = message?.textBody?.trim() || message?.previewText?.trim() || 'No message content available.';
  const body = htmlBody || `<pre>${escapeHtml(textBody)}</pre>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #1f2937;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 15px;
        line-height: 1.55;
      }
      body {
        padding: 24px;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      a {
        color: #4f46e5;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: inherit;
      }
      table {
        max-width: 100%;
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function formatListDate(value: string | null) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDetailDate(value: string | null) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getSenderLabel(message: EmailMessage) {
  return message.fromName || message.fromEmail || 'Unknown sender';
}

function getSenderInitial(message: EmailMessage | null) {
  const label = message ? getSenderLabel(message) : 'M';
  return label.trim().charAt(0).toUpperCase() || 'M';
}

function getMessageSearchText(message: EmailMessage) {
  return [
    message.subject,
    message.fromName,
    message.fromEmail,
    message.previewText,
    message.textBody,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function MailActionButton({
  icon: Icon,
  label,
}: {
  icon: typeof Reply;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition duration-200 hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-900 active:translate-y-0 active:scale-95"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function EmailInbox() {
  const navigate = useNavigate();
  const [connection, setConnection] = useState<EmailConnectionSummary | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<MailFolderId>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { connection: emailConnection } = await appApi.getEmailConnection();

      setConnection(emailConnection);

      if (!emailConnection) {
        setMessages([]);
        setSelectedMessageId(null);
        return;
      }

      const inboxResult = await appApi.getEmailInbox();

      const orderedMessages = inboxResult.messages.slice().sort((a, b) => {
        const aTime = a.receivedAt ? Date.parse(a.receivedAt) : 0;
        const bTime = b.receivedAt ? Date.parse(b.receivedAt) : 0;
        return bTime - aTime;
      });
      setMessages(orderedMessages);
      setSelectedMessageId((current) => current || orderedMessages[0]?.id || null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load your email inbox right now.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const filteredMessages = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const folderMessages =
      activeFolder === 'inbox'
        ? messages
        : messages.filter((message) => normalizeFolder(message.folder) === activeFolder);

    if (!normalizedSearch) {
      return folderMessages;
    }

    return folderMessages.filter((message) => getMessageSearchText(message).includes(normalizedSearch));
  }, [activeFolder, messages, searchQuery]);

  useEffect(() => {
    if (filteredMessages.length === 0) {
      setSelectedMessageId(null);
      return;
    }

    const hasSelectedMessage = filteredMessages.some((message) => message.id === selectedMessageId);

    if (!hasSelectedMessage) {
      setSelectedMessageId(filteredMessages[0].id);
    }
  }, [filteredMessages, selectedMessageId]);

  const selectedMessage =
    filteredMessages.find((message) => message.id === selectedMessageId) ||
    filteredMessages[0] ||
    null;
  const unreadCount = messages.filter((message) => message.isUnread).length;
  const hasEmailConnection = Boolean(connection);
  const activeFolderLabel = mailFolders.find((folder) => folder.id === activeFolder)?.label || 'Inbox';

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-[2rem] bg-gray-50 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.07)] ring-1 ring-gray-100 lg:flex-row lg:gap-3"
    >
      <section className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 lg:w-[21rem]">
        <div className="border-b border-gray-100 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900">Email Inbox</h2>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {connection?.emailAddress || `${filteredMessages.length} messages`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard/emails/template-builder')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/30 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#4a35e8] active:translate-y-0 active:scale-[0.98]"
                aria-label="Compose email"
                title="Compose"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void loadInbox()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97]"
                aria-label="Refresh mailbox"
                title="Refresh"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search"
              className="w-full rounded-xl border border-transparent bg-gray-50 py-2.5 pl-9 pr-4 text-sm transition-[border-color,box-shadow,background-color] duration-200 ease-out focus:border-[#5b45ff] focus:bg-white focus:outline-none focus:shadow-[0_0_0_4px_rgba(91,69,255,0.08)]"
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {mailFolders.map((folder) => {
                const Icon = folder.icon;
                const isActive = folder.id === activeFolder;

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setActiveFolder(folder.id)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-[0.96] ${
                      isActive
                        ? 'bg-[#5b45ff] text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                    }`}
                    aria-label={`Show ${folder.label}`}
                    title={folder.label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <span className="truncate text-[11px] font-medium text-gray-500">{activeFolderLabel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
            {isLoading ? (
              <div className="flex h-72 items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#5b45ff]" />
                Loading mailbox
              </div>
            ) : error ? (
              <div className="m-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : !hasEmailConnection ? (
              <div className="m-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
                <MailOpen className="h-6 w-6 text-[#5b45ff]" />
                <h2 className="mt-3 text-base font-semibold text-gray-950">Connect your mailbox</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Once an email provider is connected, incoming messages will appear in this inbox.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/connections?section=channels&channel=email&setup=1')}
                  className="mt-4 inline-flex h-10 items-center rounded-xl bg-[#5b45ff] px-4 text-sm font-semibold text-white transition duration-200 hover:bg-[#4f3df1] active:scale-95"
                >
                  Connect email
                </button>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center px-8 text-center">
                <MailOpen className="h-8 w-8 text-gray-300" />
                <h2 className="mt-3 text-base font-semibold text-gray-950">No mail found</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-gray-500">
                  Try a different folder or search term, then refresh the inbox.
                </p>
              </div>
            ) : (
              <motion.div
                variants={listVariants}
                initial="hidden"
                animate="visible"
                className="divide-y divide-gray-50"
              >
                {filteredMessages.map((message) => {
                  const isSelected = message.id === selectedMessage?.id;

                  return (
                    <motion.button
                      key={message.id}
                      type="button"
                      variants={rowVariants}
                      onClick={() => setSelectedMessageId(message.id)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                      className={`block w-full px-4 py-3 text-left transition-colors duration-200 ease-out ${
                        isSelected
                          ? 'bg-[#f3f1ff]'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {message.isUnread ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-[#5b45ff]" />
                            ) : null}
                            <p
                              className={`truncate text-sm ${
                                message.isUnread ? 'font-semibold text-gray-950' : 'font-medium text-gray-700'
                              }`}
                            >
                              {getSenderLabel(message)}
                            </p>
                          </div>
                          <p
                            className={`mt-1 truncate text-xs ${
                              message.isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'
                            }`}
                          >
                            {message.subject || '(No subject)'}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                            {message.previewText || 'No preview available.'}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-gray-500">
                          {formatListDate(message.receivedAt)}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
        </div>
      </section>

      <section className="mt-3 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 lg:mt-0">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 shrink-0 sm:px-6 lg:flex-nowrap">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">
              {selectedMessage ? selectedMessage.subject || '(No subject)' : 'Select an email'}
            </h2>
            {selectedMessage ? (
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-gray-500">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate">{getSenderLabel(selectedMessage)}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                <span className="truncate">{formatDetailDate(selectedMessage.receivedAt)}</span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                {filteredMessages.length} messages{unreadCount > 0 ? `, ${unreadCount} unread` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard/connections?section=channels&channel=email&setup=1')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97]"
              aria-label="Mail settings"
              title="Mail settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/connections/email')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97]"
              aria-label="Manage email connection"
              title="Manage connection"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            {selectedMessage ? (
              <>
                <MailActionButton icon={Reply} label="Reply" />
                <MailActionButton icon={ReplyAll} label="Reply all" />
                <MailActionButton icon={Forward} label="Forward" />
                <MailActionButton icon={MoreHorizontal} label="More actions" />
              </>
            ) : null}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto bg-[#f7f8fa] p-4 scrollbar-hide sm:p-6">
          {selectedMessage ? (
            <div className="mx-auto max-w-4xl">
                <motion.div
                  key={selectedMessage.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#5b45ff]/10 text-base font-semibold text-[#5b45ff]">
                        {getSenderInitial(selectedMessage)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {getSenderLabel(selectedMessage)}
                          {selectedMessage.fromEmail ? (
                            <span className="ml-1 font-normal text-gray-500">
                              &lt;{selectedMessage.fromEmail}&gt;
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          To: {selectedMessage.to.length > 0 ? selectedMessage.to.join(', ') : connection?.emailAddress || 'Mailbox'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                      <span>{formatDetailDate(selectedMessage.receivedAt)}</span>
                      <MailActionButton icon={Star} label="Star" />
                      <MailActionButton icon={Trash2} label="Delete" />
                    </div>
                  </div>

                  <div className="mt-5 border-t border-gray-100 pt-5">
                    <iframe
                      key={selectedMessage.id}
                      title={selectedMessage.subject || 'Email preview'}
                      sandbox=""
                      srcDoc={buildEmailPreviewDocument(selectedMessage)}
                      className="h-[620px] w-full rounded-xl bg-white"
                    />
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-8 text-center">
                <MailOpen className="h-10 w-10 text-gray-300" />
                <h2 className="mt-4 text-lg font-semibold text-gray-900">Select an email</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
                  Choose a message from the list to read it in the preview pane.
                </p>
              </div>
            )}
          </main>
      </section>
    </motion.div>
  );
}
