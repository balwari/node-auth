const express = require("express");
const jwt = require("jsonwebtoken");
const { db } = require("../config/db");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");

dotenv.config();

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY;

// Middleware to verify JWT
function authenticateToken(req, res, next) {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token." });
        req.user = user;
        next();
    });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}${ext}`;
        cb(null, filename);
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB file size
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true); // Accept file
        } else {
            cb(new Error("Invalid file type. Only jpeg, jpg, png are allowed."));
        }
    },
}).single("image");


router.post("/add", authenticateToken, upload, async (req, res) => {
    const { name, description, price, attributes, photo } = req.body;

    if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Name is required and must be a string." });
    }

    if (!price || isNaN(price)) {
        return res.status(400).json({ message: "Price is required and must be a number." });
    }

    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
        return res.status(400).json({ message: "Attributes are required and must be an array." });
    }

    for (const attr of attributes) {
        if (!attr.name || !attr.value) {
            return res.status(400).json({ message: "Each attribute must have a name and a value." });
        }
    }

    let image;
    
    if (req.file) {
        // If file is uploaded, save file name
        image = req.file.filename;
    } else if (photo) {
        // If url is provided, use the URL
        image = photo;
    } else {
        return res.status(400).json({ message: "Image is required. Please upload a file or provide an image URL." });
    }

    try {
        const [result, fields] = await db.query(
            "INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)",
            [name, description, price, image]
        );
        
        const productId = result.insertId;

        for (const attr of attributes) {
            const { name, value } = attr;

            const [rows, attributeFields] = await db.query("SELECT * FROM dynamic_attributes WHERE name = ?", [name]);

            let attribute;
            if (rows.length === 0) {
                const [attrResult, attrFields] = await db.query("INSERT INTO dynamic_attributes (name) VALUES (?)", [name]);
                attribute = { id: attrResult.insertId };
            } else {
                attribute = rows[0];
            }

            await db.query(
                "INSERT INTO product_attributes (product_id, attribute_id, value) VALUES (?, ?, ?)",
                [productId, attribute.id, value]
            );
        }

        res.status(201).json({ message: "Product added successfully.", productId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error.", error });
    }
});

router.get("/list", authenticateToken, async (req, res) => {
    const { filter, sort, page = 1, limit = 10, price_min, price_max, category } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT p.*, 
                   GROUP_CONCAT(CONCAT(da.name, ': ', pa.value) SEPARATOR ', ') AS attributes 
            FROM products p
        `;
        query += `
            LEFT JOIN product_attributes pa ON p.id = pa.product_id
            LEFT JOIN dynamic_attributes da ON pa.attribute_id = da.id
        `;
        query += ` GROUP BY p.id`;

        // Search filter: If a filter is provided, search across all product fields and attributes
        if (filter) {
            query += ` HAVING p.name LIKE ? OR p.description LIKE ? OR attributes LIKE ?`;
        }

        // Price range filter (if provided)
        if (price_min && price_max) {
            query += ` AND p.price BETWEEN ? AND ?`;
        } else if (price_min) {
            query += ` AND p.price >= ?`;
        } else if (price_max) {
            query += ` AND p.price <= ?`;
        }

        // Category filter (if provided)
        if (category) {
            query += ` AND p.category = ?`;
        }

        // Sorting: If sort parameter is provided, order the result accordingly
        if (sort) {
            const sortFields = ['name', 'price', 'created_at']; // You can add more sortable fields here
            if (sortFields.includes(sort)) {
                query += ` ORDER BY ${sort}`;
            } else {
                query += ` ORDER BY p.created_at`; // Default sort by creation date
            }
        }

        query += ` LIMIT ? OFFSET ?`;

        // Prepare the values to be used in the query
        const queryParams = [];

        if (filter) {
            const searchTerm = `%${filter}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }
        if (price_min && price_max) {
            queryParams.push(price_min, price_max);
        } else if (price_min) {
            queryParams.push(price_min);
        } else if (price_max) {
            queryParams.push(price_max);
        }
        if (category) {
            queryParams.push(category);
        }
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the query with parameters
        const [products] = await db.query(query, queryParams);

        // Get the total number of products for pagination
        const [totalResults] = await db.query("SELECT COUNT(*) AS count FROM products p");
        const totalProducts = totalResults[0].count;
        const totalPages = Math.ceil(totalProducts / limit);

        // Send the response with pagination info
        res.json({
            message: "Products retrieved successfully.",
            data: products,
            pagination: {
                currentPage: page,
                totalProducts,
                totalPages,
                limit,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error.", error });
    }
});

module.exports = router;
