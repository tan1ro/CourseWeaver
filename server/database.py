from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "courseweaver")

client: MongoClient = None
database: Database = None

def connect_to_mongo():
    global client, database
    try:
        # Add connection timeout and server selection timeout
        client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=5000,  # 5 seconds timeout
            connectTimeoutMS=5000,
            socketTimeoutMS=5000
        )
        database = client[DATABASE_NAME]
        # Test the connection
        client.admin.command('ping')
        print("✅ Connected to MongoDB!")
        return database
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        print("⚠️  Possible causes:")
        print("   - MongoDB server is not running")
        print("   - Network connectivity issues")
        print("   - MongoDB Atlas IP whitelist restrictions")
        print("   - Incorrect MONGODB_URI in .env file")
        # Don't raise - allow app to start but database operations will fail gracefully
        return None
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        return None

def close_mongo_connection():
    global client
    if client:
        client.close()
        print("🔌 MongoDB connection closed")

def get_database() -> Database:
    if database is None:
        connect_to_mongo()
    if database is None:
        raise ConnectionFailure("MongoDB connection not available. Please check your connection settings.")
    return database

# Collections
def get_courses_collection():
    return get_database().courses

def get_syllabi_collection():
    return get_database().syllabi

def get_outcomes_collection():
    return get_database().outcomes

def get_books_collection():
    return get_database().books 