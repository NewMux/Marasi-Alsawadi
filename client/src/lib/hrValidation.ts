export function missingStaffMessage(staffId: string) {
  return staffId ? null : "Select a staff member before continuing";
}

function runSelectedStaffAction(staffId: string, onSelected: () => void) {
  const validation = missingStaffMessage(staffId);
  if (validation) return validation;
  onSelected();
  return null;
}

export function runAttendanceStaffAction(staffId: string, onSelected: () => void) {
  return runSelectedStaffAction(staffId, onSelected);
}

export function runLeaveStaffAction(staffId: string, onSelected: () => void) {
  return runSelectedStaffAction(staffId, onSelected);
}
