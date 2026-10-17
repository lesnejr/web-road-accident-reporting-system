export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, details: err.details } });
  }
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: err.message } });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { code: 'DUPLICATE_ENTRY', message: 'Duplicate entry' } });
  }
  if (err.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: tooLarge ? 'The file is larger than the 10 MB limit' : 'The upload could not be accepted'
      }
    });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(400).json({ error: { code: 'FOREIGN_KEY_ERROR', message: 'Referenced record not found' } });
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
