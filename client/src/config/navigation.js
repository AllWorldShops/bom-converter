import {
  LayoutDashboard,
  RefreshCw,
  Settings,
  Users,
  Building2,
  Ruler,
  Factory,
  Package,
  SlidersHorizontal,
  FileText,
  ShieldCheck,
  Boxes,
  Search,
} from 'lucide-react'

// Sidebar is a tree: top-level menus > optional sub-groups > leaf items (`to`).
// A node with no `to` and no `children` renders as an inert "coming soon" row.
// `adminOnly` groups are stripped entirely for non-admin users.
// `company` groups are shown only to users of that company (admins see all).
// `label` is kept stable (React key + expand-state); `labelKey` is the i18n key
// the Sidebar renders (falling back to `label` for untranslated nodes like PEI/PM/PKS).
export const NAV_TREE = [
  { label: 'PEI', company: 'PEI' },
  {
    label: 'PM',
    company: 'PM',
    children: [{ label: 'RFQ Dashboard', labelKey: 'nav.rfqDashboard', to: '/pm/rfq-dashboard', icon: FileText }],
  },
  { label: 'PKS', company: 'PKS' },
  {
    label: 'Common', labelKey: 'nav.common',
    children: [
      {
        label: 'BOM Converter', labelKey: 'nav.bomConverter',
        children: [
          { label: 'Dashboard', labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard },
          { label: 'BOM Converter', labelKey: 'nav.convert', to: '/convert', icon: RefreshCw },
        ],
      },
      {
        label: 'Source Raw Materials', labelKey: 'nav.sourceRawMaterials',
        children: [
          { label: 'Dashboard', labelKey: 'nav.dashboard', to: '/source-raw-materials/dashboard', icon: Boxes },
          { label: 'Search', labelKey: 'nav.searchLeaf', to: '/source-raw-materials/search', icon: Search },
        ],
      },
    ],
  },
  {
    label: 'Settings', labelKey: 'nav.settings',
    icon: Settings,
    children: [
      {
        label: 'BOM Converter', labelKey: 'nav.bomConverter',
        children: [
          { label: 'Customers', labelKey: 'nav.customers', to: '/settings/customers', icon: Building2 },
          { label: 'Unit of Measure', labelKey: 'nav.unitOfMeasure', to: '/settings/unit-of-measure', icon: Ruler },
          { label: 'Manufacturers', labelKey: 'nav.manufacturers', to: '/settings/manufacturer-mappings', icon: Factory },
          { label: 'Product Registry', labelKey: 'nav.productRegistry', to: '/settings/product-registry', icon: Package },
        ],
      },
      {
        label: 'Admin', labelKey: 'nav.admin',
        icon: ShieldCheck,
        adminOnly: true,
        children: [
          { label: 'Users', labelKey: 'nav.users', to: '/settings/users', icon: Users },
          { label: 'Advanced', labelKey: 'nav.advanced', to: '/settings/advanced', icon: SlidersHorizontal },
        ],
      },
    ],
  },
]
