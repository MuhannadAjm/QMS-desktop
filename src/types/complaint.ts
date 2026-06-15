export interface ComplaintListItem {
  id: number;
  complaint_number: string;
  customer_name: string;
  customer_id: string;
  title: string;
  description: string | null;
  category: string | null;
  received_date: string;
  status: string;
  priority: string | null;
  issued_by_user_id: number | null;
  issued_by_name: string | null;
  root_cause: string | null;
  resolution: string | null;
  closed_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Cross-module links (Phase 8B)
  related_nc_id: number | null;
  related_nc_number: string | null;
  related_capa_id: number | null;
  related_capa_number: string | null;
}

export interface ComplaintAttachment {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface ComplaintActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export const COMPLAINT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const COMPLAINT_CATEGORIES = [
  'Product Quality', 'Service Quality', 'Delivery',
  'Documentation', 'Safety', 'Other',
];

export function priorityBadgeClass(priority: string | null): string {
  switch (priority) {
    case 'LOW':    return 'bg-green-100 text-green-800';
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
    case 'HIGH':   return 'bg-red-100 text-red-800';
    default:       return 'bg-gray-100 text-gray-700';
  }
}
