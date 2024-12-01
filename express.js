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

// Serve static files from the 'public/images' directory
app.use("/images", express.static(path.join(__dirname, "../../public/images")));

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log("Incoming request: " + req.url);
  next();
});

// Express setup
app.set('json spaces', 3);
app.use(cors());
app.use(morgan("short"));
app.use(express.json());

// Middleware to attach collection to request
app.param('collectionName', (req, res, next, collectionName) => {
  if (db) {
    req.collection = db.collection(collectionName);
    next();
  } else {
    res.status(500).send("Database not connected");
  }
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

// Insert a new document into a collection
app.post('/collections/:collectionName', async (req, res) => {
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

// Order route with stock validation
app.post('/collections/orders', async (req, res) => {
    console.log("Received order data:", req.body);
    const { name, phone, lessonIDs, spaces } = req.body;
  
    if (!name || !phone || !Array.isArray(lessonIDs) || lessonIDs.length === 0 || !spaces) {
      return res.status(400).json({ error: "Invalid order data" });
    }
  
    try {
      // Fetch all ordered lessons and validate stock
      const lessons = await db.collection("products").find({ _id: { $in: lessonIDs.map(id => new ObjectId(id)) } }).toArray();
  
      for (let lesson of lessons) {
        if (lessonIDs.filter(id => id === lesson._id.toString()).length > lesson.availableSpace) {
          return res.status(400).json({ error: `Not enough stock for lesson ${lesson.subject}.` });
        }
      }
  
      // Deduct spaces and update the products collection
      for (let lesson of lessons) {
        const orderedQuantity = lessonIDs.filter(id => id === lesson._id.toString()).length;
        await db.collection("products").updateOne(
          { _id: lesson._id },
          { $inc: { availableSpace: -orderedQuantity } }
        );
      }
  
      // Insert the order
      const result = await db.collection("orders").insertOne(req.body);
      res.status(201).json({ message: "Order successfully placed", result });
    } catch (err) {
      console.error("Error placing order:", err.message);
      res.status(500).json({ error: "Failed to place order" });
    }
});

// Delete a document by ID
app.delete('/collections/:collectionName/:id', async (req, res) => {
    try {
      const result = await req.collection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.json(result.deletedCount === 1 ? { msg: "success" } : { msg: "Document not found" });
    } catch (err) {
      console.error("Error deleting document:", err.message);
      res.status(500).json({ error: "Failed to delete document" });
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
  
      const PORT = 3000;
      app.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
      });
    } catch (err) {
      console.error("Error connecting to MongoDB:", err.message);
      process.exit(1); // Exit the process with an error status
    }
}

startServer();
