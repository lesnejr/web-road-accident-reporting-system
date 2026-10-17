-- Web Road Accident Reporting System - Final Schema
-- Roles: reporter, admin, traffic_officer
-- Status: submitted, under_review, needs_clarification, verified, assigned, in_progress, resolved, rejected

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('reporter','admin','traffic_officer') NOT NULL DEFAULT 'reporter',
  phone VARCHAR(30) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accident_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_reference VARCHAR(20) NOT NULL UNIQUE,
  reporter_id INT UNSIGNED NOT NULL,
  accident_category_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  accident_date DATE NOT NULL,
  accident_time TIME NULL,
  location VARCHAR(255) NOT NULL,
  latitude DECIMAL(10,8) NULL,
  longitude DECIMAL(11,8) NULL,
  vehicle_type VARCHAR(100) NULL,
  injury_status ENUM('none','injuries','fatalities','unknown') NOT NULL DEFAULT 'unknown',
  severity ENUM('minor','moderate','major','fatal') NULL,
  vehicles_involved TINYINT UNSIGNED NULL,
  injuries TINYINT UNSIGNED NULL,
  fatalities TINYINT UNSIGNED NULL,
  status ENUM('submitted','under_review','needs_clarification','verified','assigned','in_progress','resolved','rejected') NOT NULL DEFAULT 'submitted',
  assigned_to INT UNSIGNED NULL,
  verified_by INT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  verification_notes TEXT NULL,
  findings TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_category FOREIGN KEY (accident_category_id) REFERENCES accident_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS report_evidence (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  uploader_id INT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NULL,
  description VARCHAR(500) NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evidence_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS report_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  changed_by INT UNSIGNED NOT NULL,
  old_status ENUM('submitted','under_review','needs_clarification','verified','assigned','in_progress','resolved','rejected') NULL,
  new_status ENUM('submitted','under_review','needs_clarification','verified','assigned','in_progress','resolved','rejected') NOT NULL,
  reason VARCHAR(500) NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(150) NOT NULL,
  entity_type VARCHAR(150) NOT NULL,
  entity_id VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
