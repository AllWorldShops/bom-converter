import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/convert': 'Convert BOM',
  '/pm/rfq-dashboard': 'RFQ Dashboard',
  '/source-raw-materials/dashboard': 'Source Raw Materials Dashboard',
  '/source-raw-materials/search': 'Search Raw Materials',
  '/settings/users': 'Users',
  '/settings/customers': 'Customers',
  '/settings/unit-of-measure': 'Unit of Measure',
  '/settings/manufacturer-mappings': 'Manufacturer Mappings',
  '/settings/product-registry': 'Product Registry',
  '/settings/advanced': 'Advanced Settings',
}

export default function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar title={PAGE_TITLES[pathname] || 'Pecko Back Office'} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
