import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LogOut, ChevronDown, Circle } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { NAV_TREE } from '@/config/navigation'

const navItemBase = 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
const activeClass = 'bg-electric-500/20 text-electric-300'
const inactiveClass = 'text-slate-400 hover:bg-navy-700 hover:text-slate-100'

function filterTree(nodes, isAdmin) {
  return nodes
    .filter(node => !node.adminOnly || isAdmin)
    .map(node => (node.children ? { ...node, children: filterTree(node.children, isAdmin) } : node))
}

function collectPaths(node, acc = []) {
  if (node.to) acc.push(node.to)
  node.children?.forEach(child => collectPaths(child, acc))
  return acc
}

function NavNode({ node, depth, pathname, expanded, toggle }) {
  const Icon = node.icon
  const hasChildren = node.children?.length > 0
  const isEmptyGroup = !node.to && !hasChildren

  if (node.to) {
    return (
      <NavLink
        to={node.to}
        title={node.label}
        className={({ isActive }) => cn(navItemBase, isActive ? activeClass : inactiveClass)}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {Icon ? <Icon size={16} className="shrink-0" /> : <Circle size={6} className="ml-1 mr-1 fill-current shrink-0" />}
        <span className="truncate">{node.label}</span>
      </NavLink>
    )
  }

  if (isEmptyGroup) {
    return (
      <div
        className={cn(navItemBase, 'text-slate-600 cursor-default')}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        title="Coming soon"
      >
        {Icon ? <Icon size={16} className="shrink-0" /> : <Circle size={6} className="ml-1 mr-1 fill-current shrink-0" />}
        <span className="truncate">{node.label}</span>
        <span className="ml-auto text-xs italic text-slate-700 shrink-0">soon</span>
      </div>
    )
  }

  const isOpen = expanded.has(node.label + depth)
  return (
    <div>
      <button
        onClick={() => toggle(node.label + depth)}
        title={node.label}
        className={cn(navItemBase, 'w-full justify-between', inactiveClass)}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <span className="flex items-center gap-3 min-w-0">
          {Icon ? <Icon size={16} className="shrink-0" /> : <Circle size={6} className="fill-current shrink-0" />}
          <span className="truncate">{node.label}</span>
        </span>
        <ChevronDown size={14} className={cn('transition-transform shrink-0', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="mt-1 space-y-1">
          {node.children.map(child => (
            <NavNode
              key={child.label}
              node={child}
              depth={depth + 1}
              pathname={pathname}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isAdmin = user?.role === 'ADMIN'
  const tree = filterTree(NAV_TREE, isAdmin)

  const [expanded, setExpanded] = useState(() => {
    const open = new Set()
    const walk = (nodes, depth, trail) => {
      for (const node of nodes) {
        const key = node.label + depth
        const paths = collectPaths(node)
        if (paths.includes(pathname)) {
          trail.forEach(k => open.add(k))
          open.add(key)
        }
        if (node.children) walk(node.children, depth + 1, [...trail, key])
      }
    }
    walk(tree, 0, [])
    return open
  })

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleLogout() {
    try {
      await logout()
    } finally {
      navigate('/login')
    }
  }

  return (
    <aside className="w-64 min-h-screen bg-navy-900 border-r border-navy-700 flex flex-col">
      <div className="p-6 border-b border-navy-700">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Pecko</p>
        <h1 className="text-lg font-bold text-slate-100 mt-1">Back Office</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {tree.map(node => (
          <NavNode
            key={node.label}
            node={node}
            depth={0}
            pathname={pathname}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
      </nav>

      <div className="p-4 border-t border-navy-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-electric-500/20 flex items-center justify-center text-electric-300 font-bold text-sm font-mono">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{user?.username}</p>
            <p className="text-xs text-slate-500 truncate">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className={cn(navItemBase, 'w-full', inactiveClass)}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
