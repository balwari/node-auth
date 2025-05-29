const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { db } = require("./config/db");
const bcrypt = require("bcrypt");

dotenv.config();

const app = express();
app.use(bodyParser.json());

const productRoutes = require("./routes/product");
const authRoutes = require("./routes/auth");

app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not exists" });
});

function listRoutes(app) {
    console.log("Registered Routes:");
    app._router.stack.forEach((middleware) => {
        if (middleware.route) {
            const path = middleware.route.path;
            const method = Object.keys(middleware.route.methods)[0].toUpperCase();
            console.log(`${method} ${path}`);
        } else if (middleware.name === "router") {
            middleware.handle.stack.forEach((nestedMiddleware) => {
                if (nestedMiddleware.route) {
                    const path = nestedMiddleware.route.path;
                    const method = Object.keys(nestedMiddleware.route.methods)[0].toUpperCase();
                    console.log(`${method} ${middleware.regexp}${path}`);
                }
            });
        }
    });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  listRoutes(app);
});
