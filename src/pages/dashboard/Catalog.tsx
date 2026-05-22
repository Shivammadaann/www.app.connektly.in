import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Link2,
  Loader2,
  Package,
  PlusCircle,
  Store,
  Trash2,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { appApi } from '../../lib/api';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import type {
  MetaCatalogProduct,
  MetaCatalogSummary,
  WhatsAppCommerceSettings,
} from '../../lib/types';
import { DropdownSelect } from '../../components/ui/DropdownSelect';

const CURRENCY_OPTIONS = ['INR', 'USD', 'AED', 'EUR', 'GBP'] as const;

type CatalogStatus = 'Available' | 'Active';

interface ProductFormState {
  retailerId: string;
  title: string;
  description: string;
  brand: string;
  priceAmount: string;
  currency: string;
  imageLink: string;
  productLink: string;
  availability: string;
}

interface CreateCatalogFormState {
  name: string;
}

interface LinkCatalogFormState {
  catalogId: string;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  toneClassName,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  toneClassName: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClassName}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: CatalogStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
        status === 'Active'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {status}
    </span>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-[#5b45ff]' : 'bg-gray-300'
        } disabled:cursor-not-allowed disabled:opacity-60`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function Catalog() {
  const { bootstrap, businessProfile } = useAppData();
  const [catalogs, setCatalogs] = useState<MetaCatalogSummary[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<MetaCatalogSummary | null>(null);
  const [products, setProducts] = useState<MetaCatalogProduct[]>([]);
  const [createForm, setCreateForm] = useState<CreateCatalogFormState>({
    name: '',
  });
  const [linkForm, setLinkForm] = useState<LinkCatalogFormState>({
    catalogId: '',
  });
  const [productForm, setProductForm] = useState<ProductFormState>({
    retailerId: '',
    title: '',
    description: '',
    brand: '',
    priceAmount: '',
    currency: 'INR',
    imageLink: '',
    productLink: '',
    availability: 'in stock',
  });
  const [editingRetailerId, setEditingRetailerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCatalogsLoading, setIsCatalogsLoading] = useState(false);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [commerceSettings, setCommerceSettings] = useState<WhatsAppCommerceSettings | null>(null);
  const [commerceDraft, setCommerceDraft] = useState({
    isCartEnabled: false,
    isCatalogVisible: false,
  });
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const [commerceNotice, setCommerceNotice] = useState<string | null>(null);
  const [isCommerceLoading, setIsCommerceLoading] = useState(false);
  const [isSavingCommerce, setIsSavingCommerce] = useState(false);

  const connectedPhoneNumberId =
    bootstrap?.channel?.phoneNumberId || businessProfile?.phoneNumberId || null;
  const connectedWabaId = bootstrap?.channel?.wabaId || businessProfile?.wabaId || null;
  const connectedWabaName =
    bootstrap?.channel?.businessAccountName ||
    businessProfile?.businessAccountName ||
    bootstrap?.profile?.companyName ||
    null;

  const linkedCatalogCount = useMemo(
    () => (selectedCatalogId ? 1 : 0),
    [selectedCatalogId],
  );

  useEffect(() => {
    let isCancelled = false;
    setIsCatalogsLoading(true);

    void appApi
      .getMetaCatalogs()
      .then((response) => {
        if (isCancelled) {
          return;
        }

        setCatalogs(response.catalogs);
        setSelectedCatalogId(response.selectedCatalogId);
        setSelectedCatalog(
          response.catalogs.find((catalog) => catalog.id === response.selectedCatalogId) || null,
        );
      })
      .catch((nextError) => {
        if (!isCancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load Meta catalogs.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCatalogsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [connectedPhoneNumberId, connectedWabaId]);

  useEffect(() => {
    if (!selectedCatalogId) {
      setProducts([]);
      setSelectedCatalog(catalogs.find((catalog) => catalog.id === selectedCatalogId) || null);
      return;
    }

    let isCancelled = false;
    setIsProductsLoading(true);

    void appApi
      .getMetaCatalogProducts(selectedCatalogId)
      .then((response) => {
        if (isCancelled) {
          return;
        }

        setProducts(response.products);
        setSelectedCatalog(response.catalog);
      })
      .catch((nextError) => {
        if (!isCancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load catalog products.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsProductsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedCatalogId, catalogs]);

  useEffect(() => {
    if (!connectedPhoneNumberId) {
      setCommerceSettings(null);
      setCommerceDraft({
        isCartEnabled: false,
        isCatalogVisible: false,
      });
      setCommerceError(null);
      setCommerceNotice(null);
      setIsCommerceLoading(false);
      return;
    }

    let isCancelled = false;
    setIsCommerceLoading(true);
    setCommerceError(null);

    void appApi
      .getWhatsAppCommerceSettings()
      .then((response) => {
        if (isCancelled) {
          return;
        }

        setCommerceSettings(response.settings);
        setCommerceDraft({
          isCartEnabled: response.settings.isCartEnabled,
          isCatalogVisible: response.settings.isCatalogVisible,
        });
      })
      .catch((nextError) => {
        if (isCancelled) {
          return;
        }

        setCommerceError(
          nextError instanceof Error ? nextError.message : 'Failed to load WhatsApp commerce settings.',
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCommerceLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [connectedPhoneNumberId]);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const resetCommerceMessages = () => {
    setCommerceError(null);
    setCommerceNotice(null);
  };

  const hasCommerceChanges =
    Boolean(commerceSettings) &&
    (commerceDraft.isCartEnabled !== commerceSettings?.isCartEnabled ||
      commerceDraft.isCatalogVisible !== commerceSettings?.isCatalogVisible);

  const resetProductForm = () => {
    setProductForm({
      retailerId: '',
      title: '',
      description: '',
      brand: '',
      priceAmount: '',
      currency: 'INR',
      imageLink: '',
      productLink: '',
      availability: 'in stock',
    });
    setEditingRetailerId(null);
  };

  const handleSaveCommerceSettings = async () => {
    if (!connectedPhoneNumberId) {
      setCommerceError('Connect your WhatsApp Business Account first to manage commerce settings.');
      return;
    }

    resetCommerceMessages();
    setIsSavingCommerce(true);

    try {
      const response = await appApi.updateWhatsAppCommerceSettings({
        isCartEnabled: commerceDraft.isCartEnabled,
        isCatalogVisible: commerceDraft.isCatalogVisible,
      });

      setCommerceSettings(response.settings);
      setCommerceDraft({
        isCartEnabled: response.settings.isCartEnabled,
        isCatalogVisible: response.settings.isCatalogVisible,
      });
      setCommerceNotice('WhatsApp commerce settings updated successfully.');
    } catch (nextError) {
      setCommerceError(
        nextError instanceof Error ? nextError.message : 'Failed to update WhatsApp commerce settings.',
      );
    } finally {
      setIsSavingCommerce(false);
    }
  };

  const handleCreateCatalog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsSavingCatalog(true);

    try {
      const response = await appApi.createMetaCatalog({
        name: createForm.name,
      });
      const catalogsResponse = await appApi.getMetaCatalogs();
      setCatalogs(catalogsResponse.catalogs);
      setSelectedCatalogId(response.selectedCatalogId);
      setSelectedCatalog(response.catalog);
      setCreateForm({ name: '' });
      setNotice('Catalog created in Meta and made active for this workspace.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to create the catalog.');
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleLinkExistingCatalog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsSavingCatalog(true);

    try {
      const response = await appApi.selectMetaCatalog({
        catalogId: linkForm.catalogId.trim() || null,
      });
      const catalogsResponse = await appApi.getMetaCatalogs();
      setCatalogs(catalogsResponse.catalogs);
      setSelectedCatalogId(response.selectedCatalogId);
      setSelectedCatalog(
        catalogsResponse.catalogs.find((catalog) => catalog.id === response.selectedCatalogId) || null,
      );
      setLinkForm({ catalogId: '' });
      setNotice(
        response.selectedCatalogId
          ? 'Catalog selected for this workspace.'
          : 'Active catalog cleared for this workspace.',
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to select the catalog.');
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleUseCatalog = async (catalogId: string | null) => {
    resetMessages();
    setIsSavingCatalog(true);

    try {
      const response = await appApi.selectMetaCatalog({ catalogId });
      setSelectedCatalogId(response.selectedCatalogId);
      setSelectedCatalog(catalogs.find((catalog) => catalog.id === response.selectedCatalogId) || null);
      setNotice(
        response.selectedCatalogId
          ? 'Catalog marked active for this workspace.'
          : 'Active catalog cleared.',
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update the active catalog.');
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleEditProduct = (product: MetaCatalogProduct) => {
    const priceParts = (product.price || '').trim().split(/\s+/);
    const maybeCurrency = priceParts.length > 1 ? priceParts[priceParts.length - 1] : product.currency || 'INR';
    const maybeAmount =
      priceParts.length > 1 ? priceParts.slice(0, -1).join(' ') : product.price || '';

    setEditingRetailerId(product.retailerId || product.id);
    setProductForm({
      retailerId: product.retailerId || product.id,
      title: product.name || '',
      description: product.description || '',
      brand: product.brand || '',
      priceAmount: maybeAmount,
      currency: maybeCurrency || 'INR',
      imageLink: product.imageUrl || '',
      productLink: product.url || '',
      availability: product.availability || 'in stock',
    });
  };

  const handleSaveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();

    if (!selectedCatalogId) {
      setError('Choose an active catalog before managing products.');
      return;
    }

    setIsSavingProduct(true);

    try {
      const price = productForm.priceAmount.trim()
        ? `${productForm.priceAmount.trim()} ${productForm.currency.trim()}`
        : undefined;
      const response = await appApi.saveMetaCatalogItemsBatch(selectedCatalogId, {
        itemType: 'PRODUCT_ITEM',
        requests: [
          {
            method: editingRetailerId ? 'update' : 'create',
            data: {
              id: productForm.retailerId.trim(),
              title: productForm.title.trim() || undefined,
              description: productForm.description.trim() || undefined,
              brand: productForm.brand.trim() || undefined,
              price,
              image_link: productForm.imageLink.trim() || undefined,
              availability: productForm.availability.trim() || undefined,
              link: productForm.productLink.trim() || undefined,
            },
          },
        ],
      });
      setProducts(response.products);
      setSelectedCatalog(response.catalog);
      resetProductForm();
      setNotice(editingRetailerId ? 'Catalog product updated.' : 'Catalog product created.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save the product.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (retailerId: string) => {
    if (!selectedCatalogId) {
      return;
    }

    resetMessages();
    setIsSavingProduct(true);

    try {
      const response = await appApi.saveMetaCatalogItemsBatch(selectedCatalogId, {
        itemType: 'PRODUCT_ITEM',
        requests: [
          {
            method: 'delete',
            data: {
              id: retailerId,
            },
          },
        ],
      });
      setProducts(response.products);
      setSelectedCatalog(response.catalog);

      if (editingRetailerId === retailerId) {
        resetProductForm();
      }

      setNotice('Catalog product deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to delete the product.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a fresh catalog for commerce workflows or link an existing catalog to your WhatsApp Business Account.
        </p>
      </div>

      <FeedbackPopupStack
        items={[
          ...(error ? [{ id: 'catalog-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []),
          ...(notice ? [{ id: 'catalog-notice', tone: 'success' as const, message: notice, onDismiss: () => setNotice(null) }] : []),
        ]}
      />

      {!connectedWabaId ? (
        <div className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 text-amber-900 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">WhatsApp Business Account not connected</p>
              <p className="mt-1 text-sm text-amber-800">
                You can still create catalogs now, but linking them to WhatsApp requires an active channel connection first.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/channels"
            className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-950"
          >
            Open Channels
          </Link>
        </div>
      ) : null}

      <SectionCard
        title="WhatsApp Commerce Settings"
        description="Live settings from Meta for the connected WhatsApp phone number. Use these to control whether catalog browsing and cart behavior are available in WhatsApp."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {commerceError ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {commerceError}
              </div>
            ) : null}

            {commerceNotice ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {commerceNotice}
              </div>
            ) : null}

            <ToggleRow
              title="Show catalog in WhatsApp"
              description="Makes your linked catalog visible inside the WhatsApp commerce experience for this phone number."
              checked={commerceDraft.isCatalogVisible}
              disabled={isCommerceLoading || isSavingCommerce || !connectedPhoneNumberId}
              onToggle={() =>
                setCommerceDraft((current) => ({
                  ...current,
                  isCatalogVisible: !current.isCatalogVisible,
                }))
              }
            />

            <ToggleRow
              title="Enable cart in WhatsApp"
              description="Lets customers add items to a cart while interacting with your catalog on WhatsApp."
              checked={commerceDraft.isCartEnabled}
              disabled={isCommerceLoading || isSavingCommerce || !connectedPhoneNumberId}
              onToggle={() =>
                setCommerceDraft((current) => ({
                  ...current,
                  isCartEnabled: !current.isCartEnabled,
                }))
              }
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveCommerceSettings()}
                disabled={!connectedPhoneNumberId || isCommerceLoading || isSavingCommerce || !hasCommerceChanges}
                className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCommerce || isCommerceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                Save Commerce Settings
              </button>

              {commerceSettings ? (
                <button
                  type="button"
                  onClick={() =>
                    setCommerceDraft({
                      isCartEnabled: commerceSettings.isCartEnabled,
                      isCatalogVisible: commerceSettings.isCatalogVisible,
                    })
                  }
                  disabled={isCommerceLoading || isSavingCommerce || !hasCommerceChanges}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Changes
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Connected target</p>
            <p className="mt-3 text-lg font-bold text-gray-900">{connectedWabaName || 'No WhatsApp Business Account connected'}</p>
            <p className="mt-1 break-all text-sm text-gray-500">{connectedPhoneNumberId || 'Phone number unavailable'}</p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Catalog visibility</p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {commerceDraft.isCatalogVisible ? 'Visible in WhatsApp' : 'Hidden in WhatsApp'}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Cart status</p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {commerceDraft.isCartEnabled ? 'Cart enabled' : 'Cart disabled'}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Meta settings id</p>
                <p className="mt-2 break-all text-sm font-medium text-gray-900">{commerceSettings?.id || 'Available after first fetch'}</p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Store}
          label="Total catalogs"
          value={String(catalogs.length)}
          toneClassName="bg-[#eff5ff] text-[#2364ff]"
        />
        <StatCard
          icon={Link2}
          label="Active in Connektly"
          value={String(linkedCatalogCount)}
          toneClassName="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          icon={Building2}
          label="Active business account"
          value={connectedWabaName || 'Not connected'}
          toneClassName="bg-amber-50 text-amber-700"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Create Catalog"
          description="Create a new commerce catalog in your connected Meta business and make it active for this workspace."
        >
          <form className="space-y-4" onSubmit={handleCreateCatalog}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Catalog Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Summer Collection 2026"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Meta business context</p>
              <p className="mt-2 text-sm font-medium text-gray-900">{connectedWabaName || 'No WhatsApp Business Account connected'}</p>
              <p className="mt-1 text-xs text-gray-500">
                The connected Meta business discovered through Embedded Signup will own this catalog.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSavingCatalog}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4a35e8]"
            >
              {isSavingCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              Create Catalog
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title="Choose Active Catalog"
          description="Pick which accessible Meta catalog this workspace should manage for product sync and WhatsApp commerce operations."
        >
          <form className="space-y-4" onSubmit={handleLinkExistingCatalog}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Existing Catalog ID</label>
              <input
                type="text"
                value={linkForm.catalogId}
                onChange={(event) => setLinkForm((current) => ({ ...current, catalogId: event.target.value }))}
                placeholder="123456789012345"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Current active catalog</p>
              <p className="mt-2 text-sm font-medium text-gray-900">{selectedCatalog?.name || 'No active catalog selected'}</p>
              <p className="mt-1 break-all text-xs text-gray-500">{selectedCatalogId || 'Select an accessible catalog ID below'}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSavingCatalog}
                className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Use This Catalog
              </button>
              <button
                type="button"
                onClick={() => void handleUseCatalog(null)}
                disabled={isSavingCatalog || !selectedCatalogId}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear Active Catalog
              </button>
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard
        title="Accessible Meta Catalogs"
        description="These catalogs come directly from the connected Meta business context, not from local dashboard state."
      >
        {isCatalogsLoading ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            Loading catalogs from Meta...
          </div>
        ) : catalogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Catalog</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Vertical</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Products</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Business</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {catalogs.map((catalog) => (
                  <tr key={catalog.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-semibold text-gray-900">{catalog.name || 'Unnamed catalog'}</p>
                      <p className="mt-1 text-xs text-gray-500">ID: {catalog.id}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">{catalog.vertical || 'commerce'}</td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">{catalog.productCount ?? 0}</td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-medium text-gray-900">{catalog.businessName || 'Unknown business'}</p>
                      <p className="mt-1 break-all text-xs text-gray-500">{catalog.businessId || 'Business ID unavailable'}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={selectedCatalogId === catalog.id ? 'Active' : 'Available'} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        {selectedCatalogId === catalog.id ? (
                          <button
                            type="button"
                            onClick={() => void handleUseCatalog(null)}
                            className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                          >
                            Clear Active
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleUseCatalog(catalog.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Use Catalog
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-900">No catalogs yet</p>
            <p className="mt-2 text-sm text-gray-500">
              Create a catalog in Meta first, or reconnect through Embedded Signup so Connektly can discover your business catalogs.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Catalog Products"
        description="Manage product items in the active Meta catalog using the Catalog Batch API."
      >
        {selectedCatalogId ? (
          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <form className="space-y-4" onSubmit={handleSaveProduct}>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Active catalog</p>
                <p className="mt-2 text-sm font-medium text-gray-900">{selectedCatalog?.name || 'Selected catalog'}</p>
                <p className="mt-1 break-all text-xs text-gray-500">{selectedCatalogId}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Retailer ID</label>
                <input
                  type="text"
                  value={productForm.retailerId}
                  onChange={(event) => setProductForm((current) => ({ ...current, retailerId: event.target.value }))}
                  placeholder="sku-1001"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={productForm.title}
                  onChange={(event) => setProductForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Product title"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={productForm.description}
                  onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Brand</label>
                  <input
                    type="text"
                    value={productForm.brand}
                    onChange={(event) => setProductForm((current) => ({ ...current, brand: event.target.value }))}
                    placeholder="Brand"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Availability</label>
                  <input
                    type="text"
                    value={productForm.availability}
                    onChange={(event) => setProductForm((current) => ({ ...current, availability: event.target.value }))}
                    placeholder="in stock"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Price</label>
                  <input
                    type="text"
                    value={productForm.priceAmount}
                    onChange={(event) => setProductForm((current) => ({ ...current, priceAmount: event.target.value }))}
                    placeholder="20.00"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Currency</label>
                  <DropdownSelect
                    value={productForm.currency}
                    onChange={(nextCurrency) => setProductForm((current) => ({ ...current, currency: nextCurrency }))}
                    options={CURRENCY_OPTIONS.map((currency) => ({
                      value: currency,
                      label: currency,
                    }))}
                    ariaLabel="Select product currency"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Image Link</label>
                <input
                  type="url"
                  value={productForm.imageLink}
                  onChange={(event) => setProductForm((current) => ({ ...current, imageLink: event.target.value }))}
                  placeholder="https://example.com/image.jpg"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Product Link</label>
                <input
                  type="url"
                  value={productForm.productLink}
                  onChange={(event) => setProductForm((current) => ({ ...current, productLink: event.target.value }))}
                  placeholder="https://example.com/product"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                  {editingRetailerId ? 'Update Product' : 'Create Product'}
                </button>
                <button
                  type="button"
                  onClick={resetProductForm}
                  disabled={isSavingProduct}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="space-y-4">
              {isProductsLoading ? (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
                  Loading products from Meta...
                </div>
              ) : products.length > 0 ? (
                products.map((product) => (
                  <div key={product.id} className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{product.name || product.retailerId || product.id}</p>
                        <p className="mt-1 break-all text-xs text-gray-500">Retailer ID: {product.retailerId || product.id}</p>
                        {product.description ? (
                          <p className="mt-2 text-sm text-gray-600">{product.description}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span>Price: {product.price || 'Not set'}</span>
                          <span>Availability: {product.availability || 'Unknown'}</span>
                          <span>Brand: {product.brand || 'Unknown'}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditProduct(product)}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProduct(product.retailerId || product.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
                    <Package className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-gray-900">No products in this catalog yet</p>
                  <p className="mt-2 text-sm text-gray-500">
                    Use the form on the left to create the first product item through the Catalog Batch API.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-900">Choose an active catalog first</p>
            <p className="mt-2 text-sm text-gray-500">
              Product management is enabled only after you select one accessible Meta catalog for this workspace.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
