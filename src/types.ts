export type UserRole = "super_admin" | "admin" | "viewer";

export type EntityStatus = "active" | "inactive" | "deceased";

export interface UserProfile {
  id: string;
  first_name: string;
  surname: string;
  email: string;
  role: UserRole;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  branch_code: string;
  branch_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  telephone: string | null;
  email: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  employee_number: string | null;
  first_name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  position: "Doctor" | "Admin" | "Receptionist" | "Nurse" | "Staff";
  department: string | null;
  branch_id: string | null;
  hpcsa_number: string | null;
  practice_number: string | null;
  profile_image_url: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  branches?: EmployeeBranch[];
}

export interface EmployeeBranch {
  id: string;
  employee_id: string;
  branch_id: string;
  status: "active" | "inactive";
  created_at: string;
  branch?: Branch;
}

export interface Patient {
  id: string;
  patient_number: string | null;
  first_name: string;
  surname: string;
  date_of_birth: string | null;
  gender: "Male" | "Female" | "Other" | "";
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  medications: string | null;
  notes: string | null;
  branch_id: string;
  assigned_doctor_id: string | null;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  assigned_doctor?: Pick<Employee, "id" | "first_name" | "surname"> | null;
  emergency_contacts?: EmergencyContact[];
}

export interface EmergencyContact {
  id: string;
  patient_id: string;
  contact_name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  branch_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  reason: string | null;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient?: Pick<Patient, "id" | "first_name" | "surname" | "patient_number">;
  doctor?: Pick<Employee, "id" | "first_name" | "surname"> | null;
  branch?: Branch;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface QueueEntry {
  id: string;
  patient_id: string;
  branch_id: string;
  doctor_id: string | null;
  queue_number: number;
  status: "waiting" | "with_doctor" | "completed" | "cancelled";
  reason: string | null;
  checked_in_at: string;
  called_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  patient?: Pick<Patient, "id" | "first_name" | "surname" | "patient_number" | "phone">;
  doctor?: Pick<Employee, "id" | "first_name" | "surname"> | null;
  branch?: Branch;
}

export type InquiryStatus = "New" | "Contacted" | "In Progress" | "Completed" | "Canceled";
export type EmailStatus = "pending" | "sent" | "failed" | "not_applicable";

export interface Inquiry {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: InquiryStatus;
  email_status: EmailStatus;
  source: string | null;
  created_at: string;
  updated_at: string;
  patient?: Pick<Patient, "id" | "first_name" | "surname" | "patient_number"> | null;
}

export interface InquiryReply {
  id: string;
  inquiry_id: string;
  reply_message: string;
  sent_by: string | null;
  email_status: "sent" | "failed";
  created_at: string;
}

export interface SystemSettings {
  id: string;
  practice_name: string;
  practice_email: string | null;
  practice_phone: string | null;
  practice_address: string | null;
  operating_hours: Record<string, string>;
  services: string[];
  popia_notice: string | null;
  updated_at: string;
}
