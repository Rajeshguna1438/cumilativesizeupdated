import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { reportUploadDirectory } from './constants.js';

const CUMULATIVE_SIZE_FILE = './cumulativeSize.json';

// Function to read current cumulative size
const getCumulativeSize = async () => {
    try {
        const data = await fs.readFile(CUMULATIVE_SIZE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return parsed.totalSize || 0;
    } catch (err) {
        return 0;
    }
};

// Function to update cumulative size
const updateCumulativeSize = async (delta) => {
    const currentSize = await getCumulativeSize();
    const newSize = Math.max(0, currentSize + delta); // prevent negative size
    await fs.writeFile(CUMULATIVE_SIZE_FILE, JSON.stringify({ totalSize: newSize }));
    return newSize;
};

// Configure the storage engine for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, reportUploadDirectory);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
});

// File filter to allow only PDFs
const fileFilter = (req, file, cb) => {
    const filetypes = /pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Invalid file type. Only PDF files are allowed.'));
};

// Set upload limits and file filter
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 } // Limit file size to 20MB
});

// Utility function to generate a unique file name
const generateUniqueFileName = (originalName) => {
    const sanitizedOriginalName = originalName.replace(/\s+/g, '_');
    const timestamp = Date.now();
    const uniqueName = `${timestamp}-${sanitizedOriginalName}`;
    return uniqueName;
};

// Function to check if the file is a valid JPEG
const isValidJpeg = async (fileBytes) => {
    const header = fileBytes.toString('hex', 0, 2);
    return header === 'ffd8';
};

// Custom middleware to handle file upload and errors
const handleFileUpload = async (req, res, next) => {
    const singleUpload = upload.single('report_pdf');

    singleUpload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({
                    status: false,
                    status_code: 400,
                    message: "Only a single file can be uploaded for report_pdf."
                });
            }
            return res.status(400).json({
                status: false,
                status_code: 400,
                message: err.message
            });
        } else if (err) {
            if (err.message === 'Invalid file type. Only PDF files are allowed.') {
                return res.status(400).json({
                    status: false,
                    status_code: 400,
                    message: "Invalid file type. Only PDF files are accepted."
                });
            }
            return res.status(500).json({
                status: false,
                status_code: 500,
                message: "An error occurred during file upload."
            });
        }

        if (req.file && req.file.size) {
            await updateCumulativeSize(req.file.size);
        }

        next();
    });
};

// Function to handle file deletion and update size
const deleteReportFile = async (filePath) => {
    try {
        const stats = await fs.stat(filePath);
        await fs.unlink(filePath);
        await updateCumulativeSize(-stats.size);
        return true;
    } catch (err) {
        console.error("File deletion failed:", err);
        return false;
    }
};

export {
    upload,
    generateUniqueFileName,
    isValidJpeg,
    handleFileUpload,
    deleteReportFile,
    getCumulativeSize
};
