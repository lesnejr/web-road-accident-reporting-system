INSERT INTO users (name, email, password_hash, role, phone, is_active) VALUES
('System Admin', 'admin@local.test', '$2b$10$placeholderhashforadmin123', 'admin', '09170000000', 1),
('Traffic Officer', 'officer@local.test', '$2b$10$placeholderhashforofficer123', 'traffic_officer', '09170000001', 1),
('Test Reporter', 'reporter@local.test', '$2b$10$placeholderhashforreporter123', 'reporter', '09170000002', 1);

INSERT INTO accident_categories (name, description) VALUES
('Vehicle Collision', 'Two or more vehicles involved'),
('Hit and Run', 'Driver flees the scene'),
('Pedestrian Accident', 'Involving pedestrian'),
('Motorcycle Accident', 'Motorcycle-related'),
('Other', 'Other accident types');
