-- "Student management" permission is now "User management": STUDENTS -> USERS (relabel only)
UPDATE "StaffProfile" SET "permissions" = array_replace("permissions", 'STUDENTS', 'USERS') WHERE 'STUDENTS' = ANY("permissions");
