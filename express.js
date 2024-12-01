const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const propertiesReader = require("properties-reader");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();

// Load properties from the properties file
const propertiesPath = path.resolve(__dirname, 'conf/db.properties'); // Adjust the path if needed
const properties = propertiesReader(propertiesPath);

// Read database connection properties
let dbPrefix = properties.get("db.prefix");
let dbUsername = encodeURIComponent(properties.get("db.user"));
let dbPwd = encodeURIComponent(properties.get("db.pwd"));
let dbName = properties.get("db.dbName");
let dbUrl = properties.get("db.url");
let dbParams = properties.get("db.params");

// Construct the MongoDB connection URI
const uri = `${dbPrefix}${dbUsername}:${dbPwd}${dbUrl}${dbParams}`;
console.log("MongoDB Connection URI:", uri);

// Initialize MongoDB client
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
let db;

// Serve static files from the 'public/images' directory
const staticImagesPath = path.join(__dirname, "../../public/images");
console.log("Serving static files from:", path.join(__dirname, "../../public/images"));

app.use("/images", express.static(staticImagesPath));

// Middleware to log static file requests
app.use("/images", (req, res, next) => {
  console.log(`Static file requested: ${req.url}`);
  next();
});

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log("Incoming request: " + req.url);
  next();
});

// Express setup
app.set("json spaces", 3);
app.use(cors());
app.use(morgan("short"));
app.use(express.json());

// Middleware to attach collection to request
app.param("collectionName", (req, res, next, collectionName) => {
  if (db) {
    req.collection = db.collection(collectionName);
    next();
  } else {
    res.status(500).send("Database not connected");
  }
});

// Routes
app.get("/", (req, res) => {
  res.send("Select a collection, e.g., /collections/products");
});

// Get all documents in a collection
app.get("/collections/:collectionName", async (req, res, next) => {
  try {
    if (!req.collection) {
      console.error("Collection not found");
      return res.status(500).send("Collection not found");
    }

    const results = await req.collection.find({}).toArray();

    if (results.length === 0) {
      console.log("No documents found in the collection");
    }

    res.json(results);
  } catch (err) {
    console.error("Error retrieving data:", err.message);
    res.status(500).send("Error retrieving data");
  }
});

// Insert a new document into a collection
app.post("/collections/:collectionName", async (req, res) => {
  console.log("Received POST request with data:", req.body);
  try {
    const result = await req.collection.insertOne(req.body);
    console.log("Document inserted:", result);
    res.status(201).json({ message: "Document inserted", result });
  } catch (err) {
    console.error("Error inserting document:", err.message);
    res.status(500).json({ error: "Failed to insert document" });
  }
});

// Error handling for non-existent static files
app.use((req, res) => {
  res.status(404).send("Resource not found!");
});

// Start the server
async function startServer() {
  try {
    await client.connect(); // Connect to MongoDB
    db = client.db(dbName);
    console.log("Connected to MongoDB successfully");

    const PORT = process.env.PORT || 3000; // Use environment variable for port
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (err) {
    console.error("Error connecting to MongoDB:", err.message);
    process.exit(1); // Exit the process with an error status
  }
}

startServer();
