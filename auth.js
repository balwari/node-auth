const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { db } = require("../config/db");
const dotenv = require("dotenv");

dotenv.config();

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY;

function isValidPassword(password) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
    return regex.test(password);
}

// Register API
router.post("/register", async (req, res) => {
    const { name, email, mobile, password } = req.body;

    if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Name is required and must be a string." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ message: "A valid email is required." });
    }

    if (!mobile || !/^\d+$/.test(mobile)) {
        return res.status(400).json({ message: "Mobile number must be integers only." });
    }

    if (!password || !isValidPassword(password)) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters long, including one uppercase letter, one lowercase letter, and one digit.",
        });
    }

    try {
        const [rows, fields] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

        if (rows.length > 0) {
            return res.status(400).json({ message: "Email already exists." });
        }

        const [rows2, fields2] = await db.query("SELECT * FROM users WHERE mobile = ?", [mobile]);

        if (rows2.length > 0) {
            return res.status(400).json({ message: "Mobile Number already exists." });
        }

        const combinedPassword = password + SECRET_KEY;

        const hashedPassword = await bcrypt.hash(combinedPassword, 10);

        await db.query("INSERT INTO users (name, email, mobile, password) VALUES (?, ?, ?, ?)", [
            name,
            email,
            mobile,
            hashedPassword,
        ]);

        res.status(201).json({ message: "User registered successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error." });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ message: "A valid email is required." });
    }

    try {
        const [rows, fields] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

        if (rows.length === 0) {
            return res.status(400).json({ message: "Invalid email or password." });
        }

        const user = rows[0];

        const combinedPassword = password + SECRET_KEY;

        const isPasswordMatch = await bcrypt.compare(combinedPassword, user.password);

        if (!isPasswordMatch) {
            return res.status(400).json({ message: "Invalid email or password." });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: "4h" });

        res.status(200).json({ message: "Login successful.", token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error." });
    }
});

module.exports = router;