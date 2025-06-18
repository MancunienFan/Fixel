const { MongoClient } = require('mongodb');

// Chaîne de connexion à remplacer avec ton mot de passe et ta base
const uri = "mongodb://fixel:chicharito@cluster0-shard-00-00.xxxx.mongodb.net:27017,cluster0-shard-00-01.xxxx.mongodb.net:27017,cluster0-shard-00-02.xxxx.mongodb.net:27017/sample_mflix?ssl=true&replicaSet=atlas-xxxx&authSource=admin&retryWrites=true&w=majority"

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("✅ Connecté à MongoDB Atlas !");

    const db = client.db("sample_mflix");
    const collection = db.collection("users");

    // Exemple : Insérer un document
    const nouveauProduit = { name: "Test produit", password: 100, enStock: true };
    const resultat = await collection.insertOne(nouveauProduit);
    console.log("Document inséré avec l'ID :", resultat.insertedId);

    // Exemple : Lire les documents
    const produits = await collection.find({}).toArray();
    console.log("Produits trouvés :", produits);

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
    console.log("✅ Connexion fermée.");
  }
}

run();
