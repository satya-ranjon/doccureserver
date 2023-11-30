const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const stripe = require("stripe")(process.env.SCRIPE_SECRET_KEY);

const app = express();

const PORT = process.env.PORT || 4000;

// middleware
app.use(
  cors({
    origin: [process.env.CORS_ORIGIN],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const client = new MongoClient(process.env.DATABASE_URL, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const userCollection = client.db("doccure").collection("users");
    const recommendation = client.db("doccure").collection("recommendation");
    const testCollection = client.db("doccure").collection("tests");
    const bannerCollection = client.db("doccure").collection("banner");
    const bookingCollection = client.db("doccure").collection("booking");

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // ============ CREATE TOKEN =================== //
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "2h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // ============ USER Routes =================== //
    app.post("/user", async (req, res) => {
      const newUser = req.body;
      const result = await userCollection.insertOne({
        ...newUser,
        status: "active",
        role: "user",
      });
      res.send(result);
    });

    app.put("/update-profile", verifyToken, async (req, res) => {
      const { name, bloodGroup, district, upazila, avatar } = req.body;
      const email = req.user.email;
      const result = await userCollection.updateOne(
        { email: email },
        {
          $set: {
            name: name,
            bloodGroup: bloodGroup,
            district: district,
            upazila: upazila,
            avatar: avatar,
          },
        }
      );
      res.send(result);
    });

    app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
      const page = req.query.page || 1;
      const pageSize = req.query.pageSize || 10;
      const totalUsers = await userCollection.countDocuments();
      const result = await userCollection
        .find()
        .skip((page - 1) * parseFloat(pageSize))
        .limit(parseFloat(pageSize))
        .toArray();
      res.send({ data: result, totalUsers });
    });

    app.put("/user/status/:id", verifyToken, verifyAdmin, async (req, res) => {
      const userID = req.params.id;
      const status = req.body.status;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(userID) },
        {
          $set: {
            status: status,
          },
        }
      );
      res.send(result);
    });
    app.put("/user/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const userID = req.params.id;
      const role = req.body.role;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(userID) },
        {
          $set: {
            role: role,
          },
        }
      );
      res.send(result);
    });

    app.get("/admin/:email", async (req, res) => {
      const findAdmin = await userCollection.findOne({
        email: req.params.email,
        role: "admin",
      });
      res.send(findAdmin);
    });

    app.get("/user/:email", async (req, res) => {
      const findUser = await userCollection.findOne({
        email: req.params.email,
      });
      res.send(findUser);
    });

    // ============ Banner Routes =================== //
    app.get("/banner", verifyToken, verifyAdmin, async (req, res) => {
      const result = await bannerCollection.find().toArray();
      res.send(result);
    });

    app.get("/banner/:id", verifyToken, verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bannerCollection.findOne(query);
      res.send(result);
    });

    app.get("/bannerIsActive", async (req, res) => {
      const result = await bannerCollection.findOne({ isActive: "true" });
      res.send(result);
    });

    app.post("/banner", verifyToken, verifyAdmin, async (req, res) => {
      const newBanner = req.body;
      const result = await bannerCollection.insertOne(newBanner);
      res.send(result);
    });

    app.patch(
      "/banner/isActive/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const bannerId = req.params.id;
        const isActive = req.body.isActive;

        const result = await bannerCollection.updateOne(
          { _id: new ObjectId(bannerId) },
          {
            $set: {
              isActive: isActive,
            },
          }
        );
        res.send(result);
      }
    );

    app.put("/banner/:id", verifyToken, verifyAdmin, async (req, res) => {
      const bannerId = req.params.id;
      const updateData = req.body;

      const result = await bannerCollection.updateOne(
        { _id: new ObjectId(bannerId) },
        {
          $set: updateData,
        }
      );
      res.send(result);
    });

    app.delete("/banner/:id", verifyToken, verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bannerCollection.deleteOne(query);
      res.send(result);
    });

    // ============ Test Routes =================== //
    app.post("/tests", verifyToken, verifyAdmin, async (req, res) => {
      const newTest = req.body;
      const result = await testCollection.insertOne(newTest);
      res.send(result);
    });

    app.get("/tests", async (req, res) => {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      const query = {
        availableDate: { $gte: currentDate.toISOString() },
      };
      const result = await testCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/tests/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await testCollection.findOne(query);
      res.send(result);
    });

    app.put("/tests/:id", verifyToken, verifyAdmin, async (req, res) => {
      const userID = req.params.id;
      const updateData = req.body;

      const result = await testCollection.updateOne(
        { _id: new ObjectId(userID) },
        {
          $set: updateData,
        }
      );
      res.send(result);
    });

    app.delete("/tests/:id", verifyToken, verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await testCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/recommendation", async (req, res) => {
      const result = await recommendation.find().toArray();
      res.send(result);
    });

    // ============ Booking Test =================== //
    app.post("/booking-test", async (req, res) => {
      const bookingData = req.body;
      const testId = new ObjectId(bookingData.test.id);
      const findTest = await testCollection.findOne({ _id: testId });
      findTest.slots = parseInt(findTest.slots) - 1;
      await testCollection.updateOne(
        { _id: testId },
        {
          $set: { slots: findTest.slots },
        }
      );
      const result = await bookingCollection.insertOne(bookingData);
      res.send(result);
    });

    // ============ Appointments =================== //

    app.put("/add-result/:id", verifyToken, verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      let updateData = req.body;
      delete updateData.id;
      const result = await bookingCollection.updateOne(query, {
        $set: updateData,
      });
      res.send(result);
    });

    app.get(
      "/appointment/search",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.searchQuery;
        const result = await bookingCollection
          .find({
            email: { $regex: new RegExp(email, "i") },
          })
          .toArray();
        res.send(result);
      }
    );

    app.get("/all-appointments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await bookingCollection.find().toArray();
      res.send(result);
    });

    app.get("/user-appointments", verifyToken, async (req, res) => {
      const { email } = req.user;
      const result = await bookingCollection
        .find({
          email: email,
          status: "pending",
        })
        .toArray();
      res.send(result);
    });

    app.get("/user-appointments/result", verifyToken, async (req, res) => {
      const { email } = req.user;
      const result = await bookingCollection
        .find({
          email: email,
          status: "delivered",
        })
        .toArray();
      res.send(result);
    });

    app.delete("/delete-appointment/:id", verifyToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id), email: req.user.email };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    app.delete(
      "/delete-appointment/admin/:id",
      verifyToken,
      async (req, res) => {
        const query = {
          _id: new ObjectId(req.params.id),
        };
        const result = await bookingCollection.deleteOne(query);
        res.send(result);
      }
    );

    // ============ Payment Intent =================== //
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/coupon", async (req, res) => {
      const { coupon, price } = req.body;
      const result = await bannerCollection.findOne({
        isActive: "true",
        couponCode: coupon,
      });

      if (result?.couponRate) {
        const discount =
          (parseFloat(price) * parseFloat(result?.couponRate)) / 100;
        res.send({ coupon: "valid", discount: discount });
      } else {
        res.send({ coupon: "invalid" });
      }
    });

    // ================= User Profile =============== //

    app.get("/user-profile", verifyToken, async (req, res) => {
      const email = req.user.email;
      const result = await userCollection.findOne({ email: email });
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
