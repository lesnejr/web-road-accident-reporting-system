-- Duplicate reporting: a human decision links one report to another. Chains are
-- refused by the API. ON DELETE SET NULL keeps a flagged report intact if the
-- original is ever deleted.
ALTER TABLE reports
  ADD COLUMN duplicate_of_report_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_reports_duplicate_of FOREIGN KEY (duplicate_of_report_id) REFERENCES reports(id) ON DELETE SET NULL;

CREATE INDEX idx_reports_duplicate_of ON reports (duplicate_of_report_id);
