-- Sample accounts are deliberately NOT seeded here.
-- The previous placeholder hashes could never authenticate, and a seed file must
-- not ship a known administrator password.
--
-- Create the first administrator with:  node scripts/create-admin.js
-- Reporters register through the web client; staff accounts are created by an
-- administrator in User Management.

INSERT INTO accident_categories (name, description) VALUES
('Vehicle Collision', 'Two or more vehicles involved'),
('Hit and Run', 'Driver flees the scene'),
('Pedestrian Accident', 'Involving pedestrian'),
('Motorcycle Accident', 'Motorcycle-related'),
('Other', 'Other accident types')
ON DUPLICATE KEY UPDATE description = VALUES(description);
