import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

// Memory storage for parsing multipart file buffers safely
const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf'
];

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    const error: any = new Error(
      `Unsupported file type "${file.mimetype}". Allowed types: JPG, JPEG, PNG, WEBP, PDF.`
    );
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB per file limit
  },
  fileFilter
});

/**
 * Middleware handling customer photo and KYC documents
 */
export const uploadCustomerFiles = upload.fields([
  { name: 'customerPhoto', maxCount: 1 },
  { name: 'kycDocuments', maxCount: 10 },
  { name: 'aadhaarDoc', maxCount: 2 },
  { name: 'panDoc', maxCount: 2 },
  { name: 'otherDoc', maxCount: 5 }
]);

/**
 * Wrapper middleware to format Multer errors cleanly in JSON responses
 */
export const handleUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  uploadCustomerFiles(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size exceeds 10MB limit. Please upload a smaller file.'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error occurred.'
      });
    }
    next();
  });
};
