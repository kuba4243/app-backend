const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const propertiesReader = require('properties-reader');
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


// Express setup
app.set('json spaces', 3);
app.use(cors());
app.use(morgan("short"));
app.use(express.json());

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log("Incoming request: " + req.url);
  next();
});

// Middleware to attach collection to request
app.param('collectionName', (req, res, next, collectionName) => {
  if (db) {
    req.collection = db.collection(collectionName);
    next();
  } else {
    res.status(500).send("Database not connected");
  }
});

// Serve static files from the 'public/images' directory
const staticImagesPath = path.join(__dirname, "../../public/images");
console.log("Serving static files from:", path.join(__dirname, "../../public/images"));

app.use("/images", express.static(staticImagesPath));

// Middleware to log static file requests
app.use("/images", (req, res, next) => {
  console.log(`Static file requested: ${req.url}`);
  next();
});

// Routes
app.get('/', (req, res) => {
  res.send('Select a collection, e.g., /collections/products');
});

// Get all documents in a collection
app.get('/collections/:collectionName', async (req, res, next) => {
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


  // Insert order into orders collection
app.post('/collections/orders', async (req, res) => {
  console.log("Received order data:", req.body);
  const { name, phone, lessonIDs } = req.body;

  // Validate request body
  if (!name || !phone || !Array.isArray(lessonIDs) || lessonIDs.length === 0) {
    return res.status(400).json({ error: "Invalid order data" });
  }

  try {
    // Insert the order into the orders collection
    const result = await db.collection("orders").insertOne(req.body);
    console.log("Order inserted:", result);
    res.status(201).json({ message: "Order successfully placed", result });
  } catch (err) {
    console.error("Error placing order:", err.message);
    res.status(500).json({ error: "Failed to place order" });
  }
});

  

// Update any attribute in a product document by its ID
app.put('/collections/products/:id', async (req, res) => {
  const productId = req.params.id; // Get the product ID from the URL
  const updateData = req.body; // Get the fields to update from the request body

  try {
    // Ensure that the request body contains at least one field to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Perform the update operation
    const result = await db.collection("products").updateOne(
      { _id: new ObjectId(productId) }, // Match the product by its ObjectId
      { $set: updateData } // Update the specified fields
    );

    // Check if the product was found and updated
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product updated successfully", result });
  } catch (err) {
    console.error("Error updating product:", err.message);
    res.status(500).json({ error: "Failed to update product" });
  }
});


// Add this route in your existing Express server
app.get('/search', async (req, res) => {
  const { query } = req.query; // Get the search query from the query string
  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    // Perform a case-insensitive search across subject, location, price, and availableSpace
    const results = await db.collection('products').find({
      $or: [
        { subject: { $regex: query, $options: 'i' } },
        { location: { $regex: query, $options: 'i' } },
        { price: { $regex: query, $options: 'i' } },
        { availableSpace: { $regex: query, $options: 'i' } }
      ]
    }).toArray();

    res.json(results);
  } catch (err) {
    console.error("Error in search:", err.message);
    res.status(500).json({ error: "Failed to search lessons" });
  }
});
app.get('/test-db', async (req, res) => {
  try {
    const testData = await db.collection('products').find({}).limit(1).toArray();
    res.json(testData);
  } catch (error) {
    console.error("Database connection failed:", error.message); // Log the error
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
});




  // Catch-all middleware
  app.use((req, res) => {
    res.status(404).send("Resource not found!");
  });

async function startServer() {
    try {
      await client.connect(); // Connect to MongoDB
      db = client.db(dbName);
      console.log("Connected to MongoDB successfully");
  
      const PORT = 3000;
      app.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
      });
    } catch (err) {
      console.error("Error connecting to MongoDB:", err.message);
      process.exit(1); // Exit the process with an error status
    }
  }
  
  // Start the server only after successful database connection
  startServer();