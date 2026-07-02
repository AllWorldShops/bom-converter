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
export const NAV_TREE = [
  { label: 'PEI' },
  {
    label: 'PM',
    children: [{ label: 'RFQ Dashboard', to: '/pm/rfq-dashboard', icon: FileText }],
  },
  { label: 'PKS' },
  {
    label: 'Common',
    children: [
      {
        label: 'BOM Converter',
        children: [
          { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
          { label: 'BOM Converter', to: '/convert', icon: RefreshCw },
        ],
      },
      {
        label: 'Source Raw Materials',
        children: [
          { label: 'Dashboard', to: '/source-raw-materials/dashboard', icon: Boxes },
          { label: 'Search', to: '/source-raw-materials/search', icon: Search },
        ],
      },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      {
        label: 'BOM Converter',
        children: [
          { label: 'Customers', to: '/settings/customers', icon: Building2 },
          { label: 'Unit of Measure', to: '/settings/unit-of-measure', icon: Ruler },
          { label: 'Manufacturers', to: '/settings/manufacturer-mappings', icon: Factory },
          { label: 'Product Registry', to: '/settings/product-registry', icon: Package },
        ],
      },
      {
        label: 'Admin',
        icon: ShieldCheck,
        adminOnly: true,
        children: [
          { label: 'Users', to: '/settings/users', icon: Users },
          { label: 'Advanced', to: '/settings/advanced', icon: SlidersHorizontal },
        ],
      },
    ],
  },
]
