import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  ClipboardList,
  Coins,
  FileBarChart,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Palette,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  Truck,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { PERMISSIONS, type Permission } from '@/lib/rbac';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  /** Rutas adicionales que marcan este elemento como activo. */
  match?: string[];
}

export interface NavSection {
  title: string | null;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      {
        label: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      {
        label: 'Punto de venta',
        href: '/pos',
        icon: Store,
        permission: PERMISSIONS.SALES_CREATE,
      },
      {
        label: 'Ventas',
        href: '/ventas',
        icon: ShoppingCart,
        permission: PERMISSIONS.SALES_VIEW,
      },
      {
        label: 'Compras',
        href: '/compras',
        icon: Truck,
        permission: PERMISSIONS.PURCHASES_VIEW,
      },
      {
        label: 'Gastos',
        href: '/gastos',
        icon: Receipt,
        permission: PERMISSIONS.EXPENSES_VIEW,
      },
      {
        label: 'Inventario',
        href: '/inventario',
        icon: Boxes,
        permission: PERMISSIONS.INVENTORY_VIEW,
        match: ['/inventario/movimientos'],
      },
      {
        label: 'Categorías',
        href: '/categorias',
        icon: Layers,
        permission: PERMISSIONS.CATEGORIES_VIEW,
      },
      {
        label: 'Movimientos',
        href: '/inventario/movimientos',
        icon: History,
        permission: PERMISSIONS.INVENTORY_VIEW,
      },
      {
        label: 'Devoluciones',
        href: '/devoluciones',
        icon: RotateCcw,
        permission: PERMISSIONS.SALES_VIEW,
      },
    ],
  },
  {
    title: 'Tienda online',
    items: [
      {
        label: 'Resumen',
        href: '/tienda',
        icon: Store,
        permission: PERMISSIONS.STORE_VIEW,
      },
      {
        label: 'Vitrina',
        href: '/tienda/catalogo',
        icon: Layers,
        permission: PERMISSIONS.STORE_VIEW,
      },
      {
        label: 'Pedidos online',
        href: '/tienda/pedidos',
        icon: ShoppingBag,
        permission: PERMISSIONS.STORE_ORDERS_VIEW,
      },
      {
        label: 'Diseño',
        href: '/tienda/diseno',
        icon: Palette,
        permission: PERMISSIONS.STORE_MANAGE,
      },
      {
        label: 'Cupones',
        href: '/tienda/descuentos',
        icon: Ticket,
        permission: PERMISSIONS.STORE_MANAGE,
      },
      {
        label: 'Pop-ups',
        href: '/tienda/popups',
        icon: MessageSquare,
        permission: PERMISSIONS.STORE_MANAGE,
      },
    ],
  },
  {
    title: 'Relaciones',
    items: [
      {
        label: 'Clientes',
        href: '/clientes',
        icon: UsersRound,
        permission: PERMISSIONS.CUSTOMERS_VIEW,
      },
      {
        label: 'Proveedores',
        href: '/proveedores',
        icon: ClipboardList,
        permission: PERMISSIONS.SUPPLIERS_VIEW,
      },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      {
        label: 'Caja y bancos',
        href: '/caja-y-bancos',
        icon: Wallet,
        permission: PERMISSIONS.FINANCE_VIEW,
      },
      {
        label: 'Cuentas por cobrar',
        href: '/cuentas-por-cobrar',
        icon: Coins,
        permission: PERMISSIONS.RECEIVABLES_VIEW,
      },
      {
        label: 'Cuentas por pagar',
        href: '/cuentas-por-pagar',
        icon: Landmark,
        permission: PERMISSIONS.PAYABLES_VIEW,
      },
      {
        label: 'Finanzas',
        href: '/finanzas',
        icon: ArrowLeftRight,
        permission: PERMISSIONS.FINANCE_VIEW,
      },
    ],
  },
  {
    title: 'Análisis',
    items: [
      {
        label: 'Reportes',
        href: '/reportes',
        icon: FileBarChart,
        permission: PERMISSIONS.REPORTS_VIEW,
      },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Usuarios', href: '/usuarios', icon: Users, permission: PERMISSIONS.USERS_MANAGE },
      {
        label: 'Roles y permisos',
        href: '/roles',
        icon: ShieldCheck,
        permission: PERMISSIONS.ROLES_MANAGE,
      },
      {
        label: 'Auditoría',
        href: '/auditoria',
        icon: Tags,
        permission: PERMISSIONS.AUDIT_VIEW,
      },
      {
        label: 'Configuración',
        href: '/configuracion',
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_VIEW,
      },
    ],
  },
  {
    title: 'Ayuda',
    items: [
      {
        label: 'Guía de uso',
        href: '/guia',
        icon: BookOpen,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
    ],
  },
];
