# Dashboard Standardization TODO

## Approved Plan Steps

### Phase 1: Core Dashboard Updates ✅

- [x] **1.1** Update `src/pages/admin/Dashboard.jsx` ✅
    - Status cards clickable
    - Removed "Pekerjaan Terbaru"
    - Added charts + Export CSV
    - Kept Attendance section

- [x] **1.2** Update `src/pages/technician/Dashboard.jsx` ✅
    - Status cards clickable
    - Removed "Pekerjaan Saya"
    - Added charts + Export CSV (tech-specific)
    - Kept Attendance section

### Phase 2: Requests & Navigation ✅

- [x] **2.1** Update `src/pages/admin/Requests.jsx` ✅
    - Added filter badges w/ live counts

- [x] **2.2** Update `src/components/layout/sidebar.jsx` ✅
    - Removed "Reports" menu item

- [x] **2.3** Deleted `src/pages/admin/Reports.jsx` ✅

### Phase 2: Requests & Navigation

- [ ] **2.1** Update `src/pages/admin/Requests.jsx`
    - Add badges to filter buttons showing counts (like customer Services.jsx)

- [ ] **2.2** Update `src/components/layout/sidebar.jsx`
    - Remove "Reports" menu item from admin navigation

- [ ] **2.3** Handle Reports page `src/pages/admin/Reports.jsx`
    - Fully delete file (user preference: delete)

### Phase 3: Testing & Polish

- [ ] Test card navigation with ?status= param
- [ ] Verify real-time badge/chart updates
- [ ] Test responsive design on mobile
- [ ] Final QA & attempt_completion

**Current Progress: 0/10 steps complete**

**Next Action: Start Phase 1.1 - Admin Dashboard**
