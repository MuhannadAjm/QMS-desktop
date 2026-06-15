import { invoke } from '@tauri-apps/api/core';
import type { ComplaintListItem, ComplaintAttachment, ComplaintActivityEntry } from '../types/complaint';

export const complaintService = {
  listComplaints(currentUserId: number): Promise<ComplaintListItem[]> {
    return invoke('list_complaints', { currentUserId });
  },

  getComplaint(currentUserId: number, complaintRecordId: number): Promise<ComplaintListItem> {
    return invoke('get_complaint', { currentUserId, complaintRecordId });
  },

  createComplaint(
    currentUserId: number,
    customerName: string,
    customerId: string,
    title: string,
    description: string | null,
    category: string | null,
    receivedDate: string,
    priority: string,
    issuedByUserId: number | null,
    rootCause: string | null,
    resolution: string | null,
  ): Promise<ComplaintListItem> {
    return invoke('create_complaint', {
      currentUserId,
      customerName,
      customerId,
      title,
      description,
      category,
      receivedDate,
      priority,
      issuedByUserId,
      rootCause,
      resolution,
    });
  },

  updateComplaint(
    currentUserId: number,
    complaintRecordId: number,
    customerName: string,
    customerId: string,
    title: string,
    description: string | null,
    category: string | null,
    receivedDate: string,
    priority: string,
    issuedByUserId: number | null,
    rootCause: string | null,
    resolution: string | null,
  ): Promise<ComplaintListItem> {
    return invoke('update_complaint', {
      currentUserId,
      complaintRecordId,
      customerName,
      customerId,
      title,
      description,
      category,
      receivedDate,
      priority,
      issuedByUserId,
      rootCause,
      resolution,
    });
  },

  setComplaintStatus(currentUserId: number, complaintRecordId: number, status: string): Promise<ComplaintListItem> {
    return invoke('set_complaint_status', { currentUserId, complaintRecordId, status });
  },

  getComplaintActivity(currentUserId: number, complaintRecordId: number): Promise<ComplaintActivityEntry[]> {
    return invoke('get_complaint_activity', { currentUserId, complaintRecordId });
  },

  attachComplaintFile(
    currentUserId: number,
    complaintRecordId: number,
    sourceFilePath: string,
    originalFileName: string,
    note: string | null,
  ): Promise<ComplaintAttachment> {
    return invoke('attach_complaint_file', {
      currentUserId,
      complaintRecordId,
      sourceFilePath,
      originalFileName,
      note,
    });
  },

  openComplaintAttachment(currentUserId: number, attachmentId: number): Promise<void> {
    return invoke('open_complaint_attachment', { currentUserId, attachmentId });
  },

  listComplaintAttachments(currentUserId: number, complaintRecordId: number): Promise<ComplaintAttachment[]> {
    return invoke('list_complaint_attachments', { currentUserId, complaintRecordId });
  },

  createNcFromComplaint(currentUserId: number, complaintRecordId: number): Promise<ComplaintListItem> {
    return invoke('create_nc_from_complaint', { currentUserId, complaintRecordId });
  },

  createCapaFromComplaint(currentUserId: number, complaintRecordId: number): Promise<ComplaintListItem> {
    return invoke('create_capa_from_complaint', { currentUserId, complaintRecordId });
  },
};
