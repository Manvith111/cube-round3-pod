import { useState, useEffect } from 'react';
import {
  Supplier,
  Product,
  PurchaseOrder,
  Inspection,
  ExceptionItem,
  AuditLog,
  UserRole,
  OperatingMode,
} from '../types';
import {
  DEMO_SUPPLIERS,
  DEMO_PRODUCTS,
  buildDemoPurchaseOrders,
  buildDemoInspections,
} from './demoData';

const STORAGE_KEYS = {
  ROLE: 'dockproof_active_role',
  MODE: 'dockproof_operating_mode',
  SUPPLIERS: 'dockproof_suppliers',
  PRODUCTS: 'dockproof_products',
  PURCHASE_ORDERS: 'dockproof_purchase_orders',
  INSPECTIONS: 'dockproof_inspections',
  EXCEPTIONS: 'dockproof_exceptions',
  AUDIT_LOGS: 'dockproof_audit_logs',
  IS_AUTHENTICATED: 'dockproof_is_authenticated',
  USER_NAME: 'dockproof_user_name',
};


export interface AppStore {
  role: UserRole;
  setRole: (role: UserRole) => void;
  mode: OperatingMode;
  setMode: (mode: OperatingMode) => void;
  isAuthenticated: boolean;
  userName: string;
  login: (role: UserRole, name: string) => void;
  logout: () => void;
  suppliers: Supplier[];
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  inspections: Inspection[];
  exceptions: ExceptionItem[];
  auditLogs: AuditLog[];
  addSupplier: (supplier: Omit<Supplier, 'id' | 'created_at'>) => Supplier;
  addProduct: (product: Omit<Product, 'id' | 'created_at'>) => Product;
  importProducts: (products: Partial<Product>[]) => number;
  createPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'created_at'>) => PurchaseOrder;
  importPurchaseOrders: (orders: Partial<PurchaseOrder>[]) => number;
  addInspection: (inspection: Inspection) => void;
  updateInspection: (inspection: Inspection) => void;
  overrideInspection: (inspectionId: string, newStatus: Inspection['status'], reason: string, managerName: string) => void;
  addException: (exception: Omit<ExceptionItem, 'id' | 'created_at' | 'status'> & { id?: string; status?: ExceptionItem['status'] }) => ExceptionItem;
  updateException: (exceptionId: string, status: ExceptionItem['status'], notes?: string) => void;
  logAudit: (action: string, entityType: string, entityId: string, details?: unknown, reason?: string) => void;
  loadDemoData: () => void;
  clearAllData: () => void;
}


export function useAppStore(): AppStore {
  const [role, setRoleState] = useState<UserRole>(() => {
    return (localStorage.getItem(STORAGE_KEYS.ROLE) as UserRole) || 'RECEIVING_OPERATOR';
  });

  const [mode, setModeState] = useState<OperatingMode>(() => {
    return (localStorage.getItem(STORAGE_KEYS.MODE) as OperatingMode) || 'PILOT';
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED) === 'true';
  });

  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.USER_NAME) || '';
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
    return raw ? JSON.parse(raw) : [];
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return raw ? JSON.parse(raw) : [];
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
    return raw ? JSON.parse(raw) : [];
  });

  const [inspections, setInspections] = useState<Inspection[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INSPECTIONS);
      if (!raw) return [];
      const parsed: Inspection[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(-15) : [];
    } catch {
      // Corrupted — wipe and start fresh
      try { localStorage.removeItem(STORAGE_KEYS.INSPECTIONS); } catch { /* ignore */ }
      return [];
    }
  });

  const [exceptions, setExceptions] = useState<ExceptionItem[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.EXCEPTIONS);
    return raw ? JSON.parse(raw) : [];
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    return raw ? JSON.parse(raw) : [];
  });

  // Sync to localStorage
  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem(STORAGE_KEYS.ROLE, newRole);
  };

  const setMode = (newMode: OperatingMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEYS.MODE, newMode);
    logAudit('OPERATING_MODE_CHANGED', 'system', 'mode', { mode: newMode });
  };

  const login = (newRole: UserRole, name: string) => {
    setRoleState(newRole);
    localStorage.setItem(STORAGE_KEYS.ROLE, newRole);
    setIsAuthenticated(true);
    localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, 'true');
    const resolvedName = name || (newRole === 'RECEIVING_MANAGER' ? 'Receiving Manager' : 'Receiving Operator');
    setUserName(resolvedName);
    localStorage.setItem(STORAGE_KEYS.USER_NAME, resolvedName);
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEYS.IS_AUTHENTICATED);
    localStorage.removeItem(STORAGE_KEYS.USER_NAME);
    setUserName('');
  };

  /** Silently swallows QuotaExceededError — app stays functional using in-memory state */
  const safeSet = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* quota exceeded — in-memory state still intact */ }
  };

  const saveSuppliers = (list: Supplier[]) => {
    setSuppliers(list);
    safeSet(STORAGE_KEYS.SUPPLIERS, JSON.stringify(list));
  };

  const saveProducts = (list: Product[]) => {
    setProducts(list);
    safeSet(STORAGE_KEYS.PRODUCTS, JSON.stringify(list));
  };

  const savePurchaseOrders = (list: PurchaseOrder[]) => {
    setPurchaseOrders(list);
    safeSet(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(list));
  };

  /**
   * Persist inspections to localStorage.
   * Base64 photo data is NEVER persisted — it is in-memory only.
   * If the quota is exceeded we keep only the 15 most recent inspections.
   */
  const saveInspections = (list: Inspection[]) => {
    setInspections(list);

    // Strip base64 from photos — these can be MB-sized and will blow the 5 MB quota
    const stripped = list.map((insp) => ({
      ...insp,
      photos: (insp.photos ?? []).map(({ base64: _b64, ...rest }) => rest),
    }));

    try {
      localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(stripped));
    } catch {
      // Quota exceeded — keep only the 15 most recent
      try {
        localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(stripped.slice(-15)));
      } catch {
        // Last resort: drop inspections from storage (in-memory state still intact)
        try { localStorage.removeItem(STORAGE_KEYS.INSPECTIONS); } catch { /* ignore */ }
      }
    }
  };

  const saveExceptions = (list: ExceptionItem[]) => {
    setExceptions(list);
    safeSet(STORAGE_KEYS.EXCEPTIONS, JSON.stringify(list));
  };

  const logAudit = (action: string, entityType: string, entityId: string, details?: unknown, reason?: string) => {
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      entity_type: entityType,
      entity_id: entityId,
      action,
      new_value: details,
      actor_name: role === 'RECEIVING_MANAGER' ? 'Receiving Manager' : 'Receiving Operator',
      actor_role: role,
      reason,
      created_at: new Date().toISOString(),
    };
    // Keep only last 200 audit entries to avoid quota creep
    const updated = [newLog, ...auditLogs].slice(0, 200);
    setAuditLogs(updated);
    safeSet(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(updated));
  };

  const addSupplier = (supplierData: Omit<Supplier, 'id' | 'created_at'>): Supplier => {
    const newSupplier: Supplier = {
      ...supplierData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const updated = [newSupplier, ...suppliers];
    saveSuppliers(updated);
    logAudit('SUPPLIER_CREATED', 'supplier', newSupplier.id, newSupplier);
    return newSupplier;
  };

  const addProduct = (productData: Omit<Product, 'id' | 'created_at'>): Product => {
    const newProduct: Product = {
      ...productData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const updated = [newProduct, ...products];
    saveProducts(updated);
    logAudit('PRODUCT_CREATED', 'product', newProduct.id, newProduct);
    return newProduct;
  };

  const importProducts = (newItems: Partial<Product>[]): number => {
    let count = 0;
    const currentList = [...products];

    newItems.forEach((item) => {
      if (!item.sku || !item.product_name) return;
      const existingIdx = currentList.findIndex((p) => p.sku === item.sku);
      const productObj: Product = {
        id: existingIdx >= 0 ? currentList[existingIdx].id : crypto.randomUUID(),
        sku: item.sku!,
        product_name: item.product_name!,
        product_family: item.product_family,
        gtin: item.gtin || '',
        variant: item.variant || 'Standard',
        colour: item.colour || 'N/A',
        expected_units_per_carton: item.expected_units_per_carton || 1,
        description: item.description,
        required_components: item.required_components,
        active: true,
        created_at: existingIdx >= 0 ? currentList[existingIdx].created_at : new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        currentList[existingIdx] = productObj;
      } else {
        currentList.push(productObj);
      }
      count++;
    });

    saveProducts(currentList);
    logAudit('PRODUCTS_BATCH_IMPORTED', 'product_catalogue', 'batch', { count });
    return count;
  };

  const createPurchaseOrder = (poData: Omit<PurchaseOrder, 'id' | 'created_at'>): PurchaseOrder => {
    const newPO: PurchaseOrder = {
      ...poData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const updated = [newPO, ...purchaseOrders];
    savePurchaseOrders(updated);
    logAudit('PURCHASE_ORDER_CREATED', 'purchase_order', newPO.id, newPO);
    return newPO;
  };

  const importPurchaseOrders = (orders: Partial<PurchaseOrder>[]): number => {
    let count = 0;
    const currentList = [...purchaseOrders];

    orders.forEach((o) => {
      if (!o.po_number || !o.lines || o.lines.length === 0) return;
      const existingIdx = currentList.findIndex((p) => p.po_number === o.po_number);
      const poObj: PurchaseOrder = {
        id: existingIdx >= 0 ? currentList[existingIdx].id : crypto.randomUUID(),
        po_number: o.po_number!,
        supplier_id: o.supplier_id || 'unknown',
        supplier_name: o.supplier_name || 'Vendor',
        expected_arrival_date: o.expected_arrival_date,
        status: o.status || 'OPEN',
        lines: o.lines.map((l) => ({
          id: crypto.randomUUID(),
          purchase_order_id: existingIdx >= 0 ? currentList[existingIdx].id : 'pending',
          sku: l.sku,
          product_name: l.product_name || l.sku,
          gtin: l.gtin || '',
          expected_units: l.expected_units || l.expected_cartons * l.expected_units_per_carton,
          expected_cartons: l.expected_cartons,
          expected_units_per_carton: l.expected_units_per_carton,
          expected_variant: l.expected_variant,
          expected_colour: l.expected_colour,
          required_components: l.required_components,
        })),
        created_at: existingIdx >= 0 ? currentList[existingIdx].created_at : new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        currentList[existingIdx] = poObj;
      } else {
        currentList.push(poObj);
      }
      count++;
    });

    savePurchaseOrders(currentList);
    logAudit('PURCHASE_ORDERS_BATCH_IMPORTED', 'purchase_orders', 'batch', { count });
    return count;
  };

  const addInspection = (inspection: Inspection) => {
    const updated = [inspection, ...inspections];
    saveInspections(updated);

    // If inspection created exceptions, add them to exceptions list
    if (inspection.exceptions && inspection.exceptions.length > 0) {
      saveExceptions([...inspection.exceptions, ...exceptions]);
    }

    logAudit('INSPECTION_CREATED', 'inspection', inspection.id, {
      po: inspection.po_number,
      sku: inspection.product_sku,
      status: inspection.status,
    });
  };

  const updateInspection = (inspection: Inspection) => {
    const updated = inspections.map((i) => (i.id === inspection.id ? inspection : i));
    saveInspections(updated);
  };

  const overrideInspection = (
    inspectionId: string,
    newStatus: Inspection['status'],
    reason: string,
    managerName: string
  ) => {
    const target = inspections.find((i) => i.id === inspectionId);
    if (!target) return;

    const previousStatus = target.status;
    const updatedInspection: Inspection = {
      ...target,
      status: newStatus,
      action_recommendation: `[Manager Override by ${managerName}]: ${reason}`,
    };

    saveInspections(inspections.map((i) => (i.id === inspectionId ? updatedInspection : i)));

    logAudit('MANAGER_DECISION_OVERRIDE', 'inspection', inspectionId, {
      previousStatus,
      newStatus,
      managerName,
    }, reason);

    // Call server override route if available
    fetch('/api/manager/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inspectionId,
        newStatus,
        overrideReason: reason,
        managerName,
      }),
    }).catch((e) => console.warn('Server override sync notice:', e));
  };

  const addException = (
    exData: Omit<ExceptionItem, 'id' | 'created_at' | 'status'> & { id?: string; status?: ExceptionItem['status'] }
  ): ExceptionItem => {
    const newEx: ExceptionItem = {
      id: exData.id || crypto.randomUUID(),
      inspection_id: exData.inspection_id,
      purchase_order_id: exData.purchase_order_id,
      po_number: exData.po_number,
      product_sku: exData.product_sku,
      severity: exData.severity || 'HIGH',
      issue_type: exData.issue_type,
      status: exData.status || 'OPEN',
      notes: exData.notes,
      created_at: new Date().toISOString(),
    };
    saveExceptions([newEx, ...exceptions]);
    logAudit('EXCEPTION_CREATED', 'exception', newEx.id, {
      po: newEx.po_number,
      sku: newEx.product_sku,
      type: newEx.issue_type,
    });
    return newEx;
  };

  const updateException = (exceptionId: string, newStatus: ExceptionItem['status'], notes?: string) => {
    const updated = exceptions.map((e) =>
      e.id === exceptionId
        ? {
            ...e,
            status: newStatus,
            notes: notes || e.notes,
            resolved_at: newStatus === 'RESOLVED' ? new Date().toISOString() : e.resolved_at,
          }
        : e
    );
    saveExceptions(updated);
    logAudit('EXCEPTION_STATUS_UPDATED', 'exception', exceptionId, { newStatus, notes });
  };

  const loadDemoData = () => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Seed Suppliers
    const newSuppliers: Supplier[] = DEMO_SUPPLIERS.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }));
    saveSuppliers(newSuppliers);

    // 2. Seed Products
    const newProducts: Product[] = DEMO_PRODUCTS.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }));
    saveProducts(newProducts);

    // 3. Seed Purchase Orders
    const sup001 = newSuppliers[0].id;
    const sup002 = newSuppliers[1].id;
    const sup003 = newSuppliers[2].id;

    const rawPOs = buildDemoPurchaseOrders({ sup001, sup002, sup003 }, today);
    const newPOs: PurchaseOrder[] = rawPOs.map((po) => {
      const poId = crypto.randomUUID();
      return {
        ...po,
        id: poId,
        created_at: new Date().toISOString(),
        lines: po.lines.map((l) => ({ ...l, purchase_order_id: poId })),
      };
    });
    savePurchaseOrders(newPOs);

    // 4. Seed past Inspections with realistic history
    const po41 = newPOs[0].id;
    const po42 = newPOs[1].id;
    const po39 = newPOs[2].id;

    const demoInspections = buildDemoInspections({ po41, po42, po39 });
    saveInspections(demoInspections);

    // 5. Extract exceptions from EXCEPTION inspections into global exceptions list
    const allExceptions: ExceptionItem[] = demoInspections.flatMap((i) => i.exceptions || []);
    saveExceptions(allExceptions);

    logAudit('DEMO_DATA_LOADED', 'system', 'demo', {
      suppliers: newSuppliers.length,
      products: newProducts.length,
      purchaseOrders: newPOs.length,
      inspections: demoInspections.length,
    });
  };

  const clearAllData = () => {
    // Preserve auth session across data reset
    const savedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED);
    const savedName = localStorage.getItem(STORAGE_KEYS.USER_NAME);
    const savedRole = localStorage.getItem(STORAGE_KEYS.ROLE);
    const savedMode = localStorage.getItem(STORAGE_KEYS.MODE);
    localStorage.clear();
    if (savedAuth) localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, savedAuth);
    if (savedName) localStorage.setItem(STORAGE_KEYS.USER_NAME, savedName);
    if (savedRole) localStorage.setItem(STORAGE_KEYS.ROLE, savedRole);
    if (savedMode) localStorage.setItem(STORAGE_KEYS.MODE, savedMode);
    setSuppliers([]);
    setProducts([]);
    setPurchaseOrders([]);
    setInspections([]);
    setExceptions([]);
    setAuditLogs([]);
  };

  return {
    role,
    setRole,
    mode,
    setMode,
    isAuthenticated,
    userName,
    login,
    logout,
    suppliers,
    products,
    purchaseOrders,
    inspections,
    exceptions,
    auditLogs,
    addSupplier,
    addProduct,
    importProducts,
    createPurchaseOrder,
    importPurchaseOrders,
    addInspection,
    updateInspection,
    overrideInspection,
    addException,
    updateException,
    logAudit,
    loadDemoData,
    clearAllData,
  };
}
