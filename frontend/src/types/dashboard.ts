export type Deadline = {
    kind: 'task' | 'internship_end' | 'document_expiry';
    title: string;
    dueDate: string;     // ISO
    subtitle?: string;
};
