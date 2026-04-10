# System Architecture & Feature Overview

## 1. Executive Summary

**Platform Overview**
This platform is a comprehensive **High-End SaaS Admin Dashboard** designed to streamline the management of Interns, Employees, Projects, and Requests within an organization. It serves as a central hub for HR operations, project tracking, and document verification.

**Target Audience**
- **HR & Super Admins:** For managing users, approving requests, overseeing deprovisioning, and handling sensitive documents.
- **Team Leads:** For managing projects, assigning tasks, and monitoring team progress.
- **Interns & Employees:** For submitting requests (absence/extra hours), managing tasks, and uploading required documents.

**Key Value Proposition**
- **Streamlined Operations:** Automated user creation via CSV imports and intelligent deprovisioning workflows.
- **Security First:** Robust Role-Based Access Control (RBAC) and secure document handling ensuring data privacy.
- **Efficiency:** Integrated project management tools and automated request processing reduce administrative overhead.

## 2. Tech Stack Overview

### Frontend
- **Framework:** [Next.js 15](https://nextjs.org/) (React 18+)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) with support for Dark Mode.
- **Icons:** [Lucide React](https://lucide.dev/) for a consistent, modern UI.
- **State Management:** React Context API for Authentication and Theme management.
- **Visualization:** [Recharts](https://recharts.org/) for analytics and dashboards.

### Backend
- **Runtime:** [Node.js](https://nodejs.org/)
- **Framework:** [Express 5](https://expressjs.com/)
- **Database ORM:** [Prisma 6.14](https://www.prisma.io/) connecting to PostgreSQL.
- **External Integrations:**
  - **Google Drive API:** For secure, scalable file storage.
  - **Google Sheets API:** For exporting request data and reporting.
  - **MaxMind GeoIP:** For location-based security alerts.
- **Scheduling:** `node-cron` for automated background jobs.

### Security Architecture
- **Authentication:** JWT (JSON Web Tokens) stored in **HttpOnly Cookies** to prevent XSS attacks.
- **Authorization:** Granular RBAC (Role-Based Access Control) middleware (`ensureAuthenticated`, `authorize`).
- **Protection:**
  - **CSRF Protection:** Implemented via secure cookie policies.
  - **Rate Limiting:** `express-rate-limit` prevents brute-force attacks on login endpoints.
  - **Input Validation:** Strict file type validation for uploads.

## 3. Core Modules & Features

### User Management
- **Active/Inactive Logic:** Users are categorized by status to easily separate current employees from alumni or deactivated accounts.
- **Drawer-Based Editing:** A non-intrusive "Drawer" UI allows admins to edit user details without leaving the context of the main list.
- **Import Wizard:** A sophisticated 3-step CSV import tool:
  1.  **Upload:** Validates file format and size.
  2.  **Map:** Interactive column mapping with options to auto-generate or use CSV email addresses.
  3.  **Result:** Detailed summary of created users, with retry logic for failed email notifications.

### Project Management
- **Master-Detail View:** Projects are displayed in a responsive grid, opening into a detailed view for task management.
- **Task Management:** Features include checklists, due dates, and status tracking (Not Started, In Progress, Completed).
- **Permission Logic:** Flexible permissions allow all project members to collaborate and edit tasks, fostering teamwork.

### Requests & Approvals
- **Workflow:**
  1.  **Submission:** Employees submit requests for **Extra Hours** or **Absence**.
  2.  **Notification:** HR receives email notifications via `sendTemplateMail`.
  3.  **Approval:** Admins review and approve/reject requests.
  4.  **Export:** Approved requests are automatically exported to Google Sheets for payroll/record-keeping.

### Document Management
- **Secure Storage:** Documents are uploaded directly to a secure Google Drive folder structure.
- **Proxy Downloads:** Users never interact with raw Google Drive links. The backend acts as a proxy, streaming files to the client, which ensures access controls are enforced and links cannot be shared externally.
- **Expiry Tracking:** The system tracks document expiry (e.g., Passports) and notifies users/HR when renewals are needed.

### Deprovisioning System
- **Automated Lifecycle:** Configurable policies automatically identify and process users for deprovisioning after they leave.
- **Safety Mechanisms:**
  - **Delays:** Configurable delay periods (days/weeks) prevent premature deletion.
  - **Whitelist:** A "Reminder Whitelist" protects specific users from automated deprovisioning actions.
  - **Execution:** A "Google-Then-DB" approach ensures external accounts are suspended before local database records are archived or deleted.

## 4. Data Flow & Security Architecture

### Data Isolation
Data access is strictly controlled at the API level.
- **Middleware:** `ensureAuthenticated` verifies the user's identity on every protected request.
- **Contextual Access:** Endpoints like `/api/requests/me` use the authenticated user's ID (`req.user.id`) to fetch only their specific data, ensuring interns cannot view each other's requests.
- **Role Checks:** The `authorize` middleware enforces role boundaries, preventing non-admins from accessing sensitive configuration or user management endpoints.

### Deprovisioning Safety Checks
The deprovisioning system is built with fail-safes:
1.  **Policy Checks:** Before any action, the system checks the global enabled/disabled state of the policy.
2.  **Whitelist Verification:** Users on the whitelist are explicitly excluded from any automated cleanup logic.
3.  **Dry Runs & Logs:** Admins can view "Upcoming" deprovisioning actions to verify correctness before they execute.

## 5. Future Roadmap

Based on the current robust architecture, the following features are natural next steps:

- **Slack/Teams Integration:** Real-time notifications for request approvals and task updates directly in team communication channels.
- **Advanced Analytics:** Enhanced dashboards with predictive insights on project velocity and employee retention trends.
- **Mobile Application:** A React Native companion app for interns to quickly submit requests and view tasks on the go.
- **SSO Integration:** Expansion beyond Google OAuth to support SAML/OIDC for enterprise-grade Single Sign-On.
