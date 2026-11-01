import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  User,
  CustomerProfile,
  Membership,
  MembershipTransaction,
  PointsLedger,
  Cafe,
  Franchise,
  FranchisePackage,
  Staff,
  MenuCategory,
  MenuItem,
  CafeMenuCustomization,
  Order,
  OrderItem,
  Payment,
  MembershipCard,
  VisitSession,
  Notification,
  AuditLog,
  SystemSetting,
} from "../src/models";
import { DEFAULT_SETTINGS } from "../src/lib/constants";

const BCRYPT_ROUNDS = 10;
const hash = (pw: string) => bcrypt.hashSync(pw, BCRYPT_ROUNDS);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/unicafe";

async function seed() {
  console.log("Connecting to MongoDB for seeding:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB successfully.");

  const isReset = process.argv.includes("--reset");
  if (isReset) {
    console.log("Reset flag detected. Dropping existing collections...");
    await Promise.all([
      User.deleteMany({}),
      CustomerProfile.deleteMany({}),
      Membership.deleteMany({}),
      MembershipTransaction.deleteMany({}),
      PointsLedger.deleteMany({}),
      Cafe.deleteMany({}),
      Franchise.deleteMany({}),
      FranchisePackage.deleteMany({}),
      Staff.deleteMany({}),
      MenuCategory.deleteMany({}),
      MenuItem.deleteMany({}),
      CafeMenuCustomization.deleteMany({}),
      Order.deleteMany({}),
      OrderItem.deleteMany({}),
      Payment.deleteMany({}),
      MembershipCard.deleteMany({}),
      VisitSession.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
      SystemSetting.deleteMany({}),
    ]);
    console.log("Collections cleared.");
  }

  // 1. System Settings
  console.log("Seeding System Settings...");
  for (const [key, item] of Object.entries(DEFAULT_SETTINGS)) {
    await SystemSetting.findOneAndUpdate(
      { key },
      { key, value: item.value, description: item.description },
      { upsert: true, new: true }
    );
  }

  // 2. Demo Core Users
  console.log("Seeding core demo accounts...");
  const adminPw = hash("Admin@123");
  const demoPw = hash("Demo@123");

  const [adminUser] = await Promise.all([
    User.findOneAndUpdate(
      { email: "admin@unicafe.demo" },
      {
        name: "Vikram Malhotra (Super Admin)",
        email: "admin@unicafe.demo",
        mobile: "9876543210",
        passwordHash: adminPw,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    ),
  ]);

  const [supervisorUser] = await Promise.all([
    User.findOneAndUpdate(
      { email: "supervisor@unicafe.demo" },
      {
        name: "Rajesh Sharma (Area Supervisor)",
        email: "supervisor@unicafe.demo",
        mobile: "9876543211",
        passwordHash: demoPw,
        role: "SUPERVISOR",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    ),
  ]);

  const [ownerUser] = await Promise.all([
    User.findOneAndUpdate(
      { email: "owner@unicafe.demo" },
      {
        name: "Pooja Singhania (Franchise Owner)",
        email: "owner@unicafe.demo",
        mobile: "9876543212",
        passwordHash: demoPw,
        role: "FRANCHISE_OWNER",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    ),
  ]);

  const [managerUser] = await Promise.all([
    User.findOneAndUpdate(
      { email: "manager@unicafe.demo" },
      {
        name: "Anand Verma (Cafe Manager)",
        email: "manager@unicafe.demo",
        mobile: "9876543213",
        passwordHash: demoPw,
        role: "MANAGER",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    ),
  ]);

  const [staffUser] = await Promise.all([
    User.findOneAndUpdate(
      { email: "staff@unicafe.demo" },
      {
        name: "Deepak Patel (Cafe Staff)",
        email: "staff@unicafe.demo",
        mobile: "9876543214",
        passwordHash: demoPw,
        role: "STAFF",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    ),
  ]);

  const [primaryCustomer] = await Promise.all([
    User.findOneAndUpdate(
      { email: "customer@unicafe.demo" },
      {
        name: "Aakash Mehta (Customer)",
        email: "customer@unicafe.demo",
        mobile: "9876543215",
        passwordHash: demoPw,
        role: "CUSTOMER",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    ),
  ]);

  // 3. Franchise Packages
  console.log("Seeding Franchise Packages...");
  const packagesData = [
    {
      name: "UniCafe Express",
      amount: 2500000,
      cafeSize: "400 - 600 sq ft",
      setupInclusions: ["Interior design layout", "Signage & branding elements", "POS hardware & counter setup", "Basic ventilation & audio"],
      equipmentInclusions: ["2-Group Espresso Machine", "Commercial grinder", "Undercounter refrigerator", "Commercial blender"],
      trainingSupport: "7 days on-site barista and operations training for up to 3 staff members.",
      status: "ACTIVE" as const,
      isDemo: true,
    },
    {
      name: "UniCafe Lounge",
      amount: 5000000,
      cafeSize: "800 - 1200 sq ft",
      setupInclusions: ["Full architectural architectural concept", "Custom bespoke furniture", "Dual RFID card gate / kiosk terminal", "Acoustic treatment"],
      equipmentInclusions: ["3-Group Premium Espresso Machine", "Cold brew tower system", "Commercial combi-oven", "Ice maker & 3 refrigeration units"],
      trainingSupport: "14 days operational training, pre-launch marketing campaign & supervisor deployment.",
      status: "ACTIVE" as const,
      isDemo: true,
    },
    {
      name: "UniCafe Premier Hub",
      amount: 7500000,
      cafeSize: "1500 - 2200 sq ft",
      setupInclusions: ["Multi-zone seating layout (workspaces + lounge)", "High-speed enterprise Wi-Fi mesh", "Dual RFID/NFC turnstiles", "Merchandise display zone"],
      equipmentInclusions: ["Custom La Marzocco machine", "Automated batch brewer", "Full bakery display and warming stations", "Commercial dishwashing line"],
      trainingSupport: "21 days comprehensive store management, staff onboarding, ongoing monthly audits.",
      status: "ACTIVE" as const,
      isDemo: true,
    },
    {
      name: "UniCafe Flagship Experience",
      amount: 10000000,
      cafeSize: "2500 - 4000 sq ft",
      setupInclusions: ["Flagship destination architecture", "Roastery showcase area", "Private meeting pod systems", "Turnstile NFC access management"],
      equipmentInclusions: ["Complete roastery + 3-group specialty espresso setup", "Full kitchen equipment for hot meals", "Smart IoT temperature controls"],
      trainingSupport: "30 days masterclass barista academy, dedicated franchise business manager for 6 months.",
      status: "ACTIVE" as const,
      isDemo: true,
    },
  ];

  const packageDocs = await Promise.all(
    packagesData.map((pkg) =>
      FranchisePackage.findOneAndUpdate({ name: pkg.name }, pkg, { upsert: true, new: true })
    )
  );

  // 4. Franchises
  console.log("Seeding Franchises...");
  const franchise1 = await Franchise.findOneAndUpdate(
    { code: "FRAN-BLR-01" },
    {
      name: "Singhania Hospitality (South Bangalore)",
      code: "FRAN-BLR-01",
      owner: ownerUser._id,
      supervisor: supervisorUser._id,
      package: packageDocs[1]._id,
      city: "Bengaluru",
      state: "Karnataka",
      status: "ACTIVE",
      paymentStatus: "PAID",
      agreedAmount: 5000000,
      amountPaid: 5000000,
      agreementDate: new Date("2025-06-15"),
      applicantName: "Pooja Singhania",
      applicantEmail: "owner@unicafe.demo",
      applicantPhone: "9876543212",
      approvedBy: adminUser._id,
      approvedAt: new Date("2025-06-16"),
      isDemo: true,
    },
    { upsert: true, new: true }
  );

  const franchise2 = await Franchise.findOneAndUpdate(
    { code: "FRAN-MUM-01" },
    {
      name: "Apex Cafe Concepts (Mumbai West)",
      code: "FRAN-MUM-01",
      owner: ownerUser._id,
      supervisor: supervisorUser._id,
      package: packageDocs[2]._id,
      city: "Mumbai",
      state: "Maharashtra",
      status: "APPROVED",
      paymentStatus: "PARTIAL",
      agreedAmount: 7500000,
      amountPaid: 3750000,
      agreementDate: new Date("2026-01-10"),
      applicantName: "Pooja Singhania",
      applicantEmail: "owner@unicafe.demo",
      applicantPhone: "9876543212",
      approvedBy: adminUser._id,
      approvedAt: new Date("2026-01-12"),
      isDemo: true,
    },
    { upsert: true, new: true }
  );

  const franchise3 = await Franchise.findOneAndUpdate(
    { code: "FRAN-DEL-01" },
    {
      name: "Capital Cuppa Partners (Delhi NCR)",
      code: "FRAN-DEL-01",
      package: packageDocs[0]._id,
      city: "New Delhi",
      state: "Delhi",
      status: "PENDING_APPROVAL",
      paymentStatus: "PENDING",
      agreedAmount: 2500000,
      amountPaid: 0,
      applicantName: "Rohan Kapoor",
      applicantEmail: "rohan.kapoor@example.com",
      applicantPhone: "9811223344",
      notes: "Pending site inspection for Connaught Place outer circle outlet.",
      isDemo: true,
    },
    { upsert: true, new: true }
  );

  // 5. Cafes (At least 5 realistic locations)
  console.log("Seeding Cafes...");
  const cafesData = [
    {
      name: "UniCafe Indiranagar 100ft",
      code: "UC-BLR-01",
      slug: "indiranagar-bangalore",
      address: {
        line1: "542, 100 Feet Road, HAL 2nd Stage, Indiranagar",
        area: "Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      },
      phone: "+91 80 4123 4567",
      email: "indiranagar@unicafe.demo",
      openingHours: "07:30 - 23:30",
      seatingCapacity: 65,
      ownershipType: "FRANCHISE" as const,
      franchise: franchise1._id,
      supervisor: supervisorUser._id,
      manager: managerUser._id,
      status: "ACTIVE" as const,
      image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
      isDemo: true,
    },
    {
      name: "UniCafe Koramangala 4th Block",
      code: "UC-BLR-02",
      slug: "koramangala-bangalore",
      address: {
        line1: "88, 80 Feet Road, 4th Block, Koramangala",
        area: "Koramangala",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560034",
      },
      phone: "+91 80 4222 9876",
      email: "koramangala@unicafe.demo",
      openingHours: "08:00 - 23:00",
      seatingCapacity: 50,
      ownershipType: "FRANCHISE" as const,
      franchise: franchise1._id,
      supervisor: supervisorUser._id,
      status: "ACTIVE" as const,
      image: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80",
      isDemo: true,
    },
    {
      name: "UniCafe Bandra Kurla Complex (BKC)",
      code: "UC-MUM-01",
      slug: "bkc-mumbai",
      address: {
        line1: "Unit G-04, Ground Floor, Maker Maxity, BKC",
        area: "Bandra East",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400051",
      },
      phone: "+91 22 6677 8899",
      email: "bkc@unicafe.demo",
      openingHours: "07:00 - 23:00",
      seatingCapacity: 75,
      ownershipType: "COMPANY" as const,
      supervisor: supervisorUser._id,
      status: "ACTIVE" as const,
      image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
      isDemo: true,
    },
    {
      name: "UniCafe Connaught Place (CP)",
      code: "UC-DEL-01",
      slug: "connaught-place-delhi",
      address: {
        line1: "Block B, Radial Road 3, Inner Circle, CP",
        area: "Connaught Place",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110001",
      },
      phone: "+91 11 4355 6677",
      email: "cp@unicafe.demo",
      openingHours: "08:00 - 23:00",
      seatingCapacity: 60,
      ownershipType: "COMPANY" as const,
      status: "ACTIVE" as const,
      image: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80",
      isDemo: true,
    },
    {
      name: "UniCafe Cyber Hub",
      code: "UC-GGN-01",
      slug: "cyber-hub-gurgaon",
      address: {
        line1: "Unit 12B, DLF Cyber Hub, DLF Phase 2",
        area: "Cyber City",
        city: "Gurugram",
        state: "Haryana",
        pincode: "122002",
      },
      phone: "+91 124 498 7654",
      email: "cyberhub@unicafe.demo",
      openingHours: "07:00 - 00:00",
      seatingCapacity: 85,
      ownershipType: "COMPANY" as const,
      status: "ACTIVE" as const,
      image: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80",
      isDemo: true,
    },
  ];

  const cafeDocs = await Promise.all(
    cafesData.map((c) => Cafe.findOneAndUpdate({ code: c.code }, c, { upsert: true, new: true }))
  );

  // Link manager & staff to cafes
  await Staff.findOneAndUpdate(
    { user: managerUser._id },
    {
      user: managerUser._id,
      cafes: [cafeDocs[0]._id, cafeDocs[1]._id],
      position: "MANAGER",
      designation: "General Store Manager",
      employeeCode: "EMP-MGR-001",
      permissions: { canAssignCards: true, canCancelOrders: true },
      status: "ACTIVE",
      isDemo: true,
    },
    { upsert: true, new: true }
  );

  await Staff.findOneAndUpdate(
    { user: staffUser._id },
    {
      user: staffUser._id,
      cafes: [cafeDocs[0]._id],
      position: "STAFF",
      designation: "Lead Barista & Host",
      employeeCode: "EMP-STF-001",
      permissions: { canAssignCards: true, canCancelOrders: true },
      status: "ACTIVE",
      isDemo: true,
    },
    { upsert: true, new: true }
  );

  // 6. Menu Categories & Items (8 Categories & 40+ Items)
  console.log("Seeding Menu Categories & 40+ Items...");
  const categoriesData = [
    { name: "Coffee", slug: "coffee", description: "Freshly roasted single origin and signature espresso blends", sortOrder: 1 },
    { name: "Tea & Chai", slug: "tea", description: "Artisanal loose-leaf teas, spiced chais and herbal infusions", sortOrder: 2 },
    { name: "Cold Beverages", slug: "cold-beverages", description: "Iced coffees, cold brews, refreshers and fresh juices", sortOrder: 3 },
    { name: "Snacks", slug: "snacks", description: "Quick bites, cookies, fries and savory dips", sortOrder: 4 },
    { name: "Sandwiches & Wraps", slug: "sandwiches", description: "Freshly grilled gourmet sourdough paninis and wraps", sortOrder: 5 },
    { name: "Pizza & Flatbreads", slug: "pizza", description: "Crisp hand-tossed artisan thin-crust flatbreads", sortOrder: 6 },
    { name: "Desserts & Bakery", slug: "desserts", description: "Freshly baked pastries, cheesecakes and brownies", sortOrder: 7 },
    { name: "Meals & Bowls", slug: "meals", description: "Nutritious grain bowls, pastas and wholesome platters", sortOrder: 8 },
  ];

  const catDocs = await Promise.all(
    categoriesData.map((c) => MenuCategory.findOneAndUpdate({ slug: c.slug }, c, { upsert: true, new: true }))
  );
  const catMap = new Map(catDocs.map((c) => [c.slug, c._id]));

  const itemsData = [
    // Coffee (6 items)
    { name: "Espresso Doppio", category: catMap.get("coffee")!, pointsPrice: 180, isVeg: true, description: "Intense double shot of single origin Arabica with rich crema" },
    { name: "Americano Classic", category: catMap.get("coffee")!, pointsPrice: 210, isVeg: true, description: "Double shot espresso elongated with hot filtered water" },
    { name: "Cappuccino Italiano", category: catMap.get("coffee")!, pointsPrice: 250, isVeg: true, description: "Equal parts espresso, silky steamed milk and dense velvet foam" },
    { name: "Caffe Latte", category: catMap.get("coffee")!, pointsPrice: 260, isVeg: true, description: "Rich espresso balanced with generous steamed milk and micro-foam" },
    { name: "Caramel Macchiato", category: catMap.get("coffee")!, pointsPrice: 295, isVeg: true, description: "Vanilla-infused milk marked with espresso and artisanal caramel drizzle" },
    { name: "Mocha Cortado", category: catMap.get("coffee")!, pointsPrice: 280, isVeg: true, description: "Dark Belgian cocoa blended with double espresso and velvety milk" },

    // Tea & Chai (5 items)
    { name: "Masala Chai Pot", category: catMap.get("tea")!, pointsPrice: 160, isVeg: true, description: "Freshly brewed Assam CTC with cardamom, clove, ginger and cinnamon" },
    { name: "Kashmiri Kahwa", category: catMap.get("tea")!, pointsPrice: 220, isVeg: true, description: "Green tea steeped with saffron strands, crushed almonds and cinnamon" },
    { name: "Earl Grey Reserve", category: catMap.get("tea")!, pointsPrice: 210, isVeg: true, description: "Premium Ceylon black tea infused with cold-pressed Italian bergamot" },
    { name: "Jasmine Green Blossom", category: catMap.get("tea")!, pointsPrice: 210, isVeg: true, description: "Delicate green tea scented with midnight-blooming jasmine flowers" },
    { name: "Chamomile Citrus Infusion", category: catMap.get("tea")!, pointsPrice: 230, isVeg: true, description: "Caffeine-free whole chamomile flowers with hints of valerian and orange peel" },

    // Cold Beverages (6 items)
    { name: "Signature 18-Hour Cold Brew", category: catMap.get("cold-beverages")!, pointsPrice: 280, isVeg: true, description: "Slow-steeped Arabica blend, exceptionally smooth with notes of chocolate" },
    { name: "Iced Spanish Latte", category: catMap.get("cold-beverages")!, pointsPrice: 310, isVeg: true, description: "Chilled espresso sweetened with condensed milk over crystal clear ice" },
    { name: "Cold Brew Tonic & Citrus", category: catMap.get("cold-beverages")!, pointsPrice: 320, isVeg: true, description: "Cold brew layered over artisanal tonic water and fresh orange slice" },
    { name: "Matcha Iced Cloud", category: catMap.get("cold-beverages")!, pointsPrice: 340, isVeg: true, description: "Ceremonial Japanese Uji matcha topped with sweet milk cold foam" },
    { name: "Peach Passion Fruit Iced Tea", category: catMap.get("cold-beverages")!, pointsPrice: 240, isVeg: true, description: "Brewed black tea infused with natural white peach and passion fruit puree" },
    { name: "Cold-Pressed Valencia Orange", category: catMap.get("cold-beverages")!, pointsPrice: 260, isVeg: true, description: "100% pure cold-pressed orange juice with zero added sugar or preservatives" },

    // Snacks (5 items)
    { name: "Truffle Parmesan Hand-cut Fries", category: catMap.get("snacks")!, pointsPrice: 280, isVeg: true, description: "Golden potato wedges tossed with white truffle oil and aged parmesan" },
    { name: "Jalapeno Cheese Poppers", category: catMap.get("snacks")!, pointsPrice: 290, isVeg: true, description: "Crisp crumb-coated bites molten with spicy cheddar and Monterey Jack" },
    { name: "Spiced Sweet Potato Wedges", category: catMap.get("snacks")!, pointsPrice: 260, isVeg: true, description: "Oven-roasted wedges tossed in peri peri spice, served with garlic aioli" },
    { name: "Smoked Hummus & Warm Pita", category: catMap.get("snacks")!, pointsPrice: 320, isVeg: true, description: "Creamy chickpea puree with smoked paprika, olive oil and grilled flatbread" },
    { name: "Nachos Grande Supremo", category: catMap.get("snacks")!, pointsPrice: 360, isVeg: true, description: "Tortilla chips loaded with warm queso, black beans, salsa and sour cream" },

    // Sandwiches & Wraps (5 items)
    { name: "Bocconcini Pesto Panini", category: catMap.get("sandwiches")!, pointsPrice: 380, isVeg: true, description: "Fresh mozzarella, sun-dried tomatoes and basil walnut pesto on sourdough" },
    { name: "Grilled Paneer Tikka Wrap", category: catMap.get("sandwiches")!, pointsPrice: 350, isVeg: true, description: "Clay-oven marinated cottage cheese with mint chutney in whole wheat tortilla" },
    { name: "Smoked Chicken & Avocado Sandwich", category: catMap.get("sandwiches")!, pointsPrice: 420, isVeg: false, description: "Hickory smoked chicken breast, Hass avocado, dijon mayonnaise on multigrain" },
    { name: "BBQ Pulled Chicken Toastie", category: catMap.get("sandwiches")!, pointsPrice: 410, isVeg: false, description: "Slow-cooked shredded chicken in smoky barbecue glaze with cheddar melt" },
    { name: "Falafel & Pickled Veggie Pita", category: catMap.get("sandwiches")!, pointsPrice: 340, isVeg: true, description: "Crispy herbed falafel patties, tahini sauce, pickled beets in fresh pita pocket" },

    // Pizza & Flatbreads (5 items)
    { name: "Margherita Classica Flatbread", category: catMap.get("pizza")!, pointsPrice: 440, isVeg: true, description: "San Marzano tomato sugo, buffalo mozzarella, fresh sweet basil and extra virgin olive oil" },
    { name: "Wild Mushroom & Truffle Flatbread", category: catMap.get("pizza")!, pointsPrice: 510, isVeg: true, description: "Shiitake and button mushrooms with thyme garlic cream and truffle reduction" },
    { name: "Fiery Paneer & Jalapeno Flatbread", category: catMap.get("pizza")!, pointsPrice: 480, isVeg: true, description: "Spiced paneer cubes, pickled jalapenos, roasted bell peppers, mozzarella" },
    { name: "Smoked Pepperoni Classico", category: catMap.get("pizza")!, pointsPrice: 580, isVeg: false, description: "Cured Italian pepperoni slices, spicy marinara, herb-infused mozzarella" },
    { name: "Grilled Pesto Chicken Flatbread", category: catMap.get("pizza")!, pointsPrice: 540, isVeg: false, description: "Roasted chicken chunks, pine-nut basil pesto, cherry tomatoes, bocconcini" },

    // Desserts & Bakery (5 items)
    { name: "Belgian Chocolate Lava Cake", category: catMap.get("desserts")!, pointsPrice: 320, isVeg: true, description: "Warm molten center cake crafted with 70% dark Callebaut chocolate" },
    { name: "New York Baked Cheesecake", category: catMap.get("desserts")!, pointsPrice: 340, isVeg: true, description: "Rich dense Philadelphia cream cheese cake served with wild blueberry compote" },
    { name: "Tiramisu della Nonna", category: catMap.get("desserts")!, pointsPrice: 330, isVeg: true, description: "Savoiardi ladyfingers soaked in espresso, layered with airy mascarpone cream" },
    { name: "Butter Croissant Parisienne", category: catMap.get("desserts")!, pointsPrice: 190, isVeg: true, description: "Authentic 27-layer laminated French butter pastry, baked crisp daily" },
    { name: "Warm Fudgy Walnut Brownie", category: catMap.get("desserts")!, pointsPrice: 240, isVeg: true, description: "Fudgy double chocolate brownie stuffed with toasted Kashmiri walnuts" },

    // Meals & Bowls (5 items)
    { name: "Mediterranean Falafel Mezze Bowl", category: catMap.get("meals")!, pointsPrice: 450, isVeg: true, description: "Quinoa, herbed falafel, tzatziki, hummus, tabbouleh and Kalamata olives" },
    { name: "Creamy Burrata Pesto Fettuccine", category: catMap.get("meals")!, pointsPrice: 490, isVeg: true, description: "Fresh pasta tossed in basil walnut pesto, crowned with a whole artisan burrata ball" },
    { name: "Penne all'Arrabbiata con Pollo", category: catMap.get("meals")!, pointsPrice: 480, isVeg: false, description: "Spicy garlic tomato sauce with grilled herbed chicken and shaved parmesan" },
    { name: "Pan-Seared Teriyaki Chicken Bowl", category: catMap.get("meals")!, pointsPrice: 495, isVeg: false, description: "Japanese glazed chicken thigh over jasmine rice with edamame and sesame greens" },
    { name: "Mexican Fiesta Quinoa Bowl", category: catMap.get("meals")!, pointsPrice: 440, isVeg: true, description: "Black beans, sweet corn, guacamole, salsa and lime-infused spiced quinoa" },
  ];

  const menuItemDocs = await Promise.all(
    itemsData.map((item) =>
      MenuItem.findOneAndUpdate(
        { name: item.name },
        { ...item, active: true, scope: "CENTRAL", approvalStatus: "APPROVED" },
        { upsert: true, new: true }
      )
    )
  );
  console.log(`Seeded ${menuItemDocs.length} menu items.`);

  // Cafe menu customization sample (Indiranagar availability / approved price)
  await CafeMenuCustomization.findOneAndUpdate(
    { cafe: cafeDocs[0]._id, menuItem: menuItemDocs[0]._id },
    { cafe: cafeDocs[0]._id, menuItem: menuItemDocs[0]._id, isAvailable: true, priceStatus: "NONE" },
    { upsert: true }
  );

  // 7. Customers (20+ Demo Customers with varying balances, hours, cards, profiles)
  console.log("Seeding 20+ Demo Customers with realistic profiles, memberships & cards...");
  const customerSeeds = [
    { name: "Aakash Mehta", email: "customer@unicafe.demo", mobile: "9876543215", points: 4800, hours: 142, status: "ACTIVE" as const, cardUid: "E20000190601", cardType: "NFC" as const },
    { name: "Rhea Sen", email: "rhea.sen@demo.unicafe", mobile: "9876543220", points: 5000, hours: 150, status: "ACTIVE" as const, cardUid: "E20000190602", cardType: "NFC" as const },
    { name: "Arjun Nair", email: "arjun.nair@demo.unicafe", mobile: "9876543221", points: 3450, hours: 98, status: "ACTIVE" as const, cardUid: "E20000190603", cardType: "RFID" as const },
    { name: "Sneha Rao", email: "sneha.rao@demo.unicafe", mobile: "9876543222", points: 1200, hours: 24, status: "ACTIVE" as const, cardUid: "E20000190604", cardType: "NFC" as const },
    { name: "Devansh Roy", email: "devansh.roy@demo.unicafe", mobile: "9876543223", points: 7800, hours: 150, status: "ACTIVE" as const, cardUid: "E20000190605", cardType: "NFC" as const },
    { name: "Kritika Joshi", email: "kritika.joshi@demo.unicafe", mobile: "9876543224", points: 450, hours: 6, status: "ACTIVE" as const, cardUid: "E20000190606", cardType: "RFID" as const },
    { name: "Manish Reddy", email: "manish.reddy@demo.unicafe", mobile: "9876543225", points: 0, hours: 0, status: "ACTIVE" as const, cardUid: "E20000190607", cardType: "NFC" as const }, // Exhausted hours
    { name: "Tanvi Saxena", email: "tanvi.saxena@demo.unicafe", mobile: "9876543226", points: 2900, hours: 85, status: "ACTIVE" as const, cardUid: "E20000190608", cardType: "NFC" as const },
    { name: "Gaurav Bansal", email: "gaurav.bansal@demo.unicafe", mobile: "9876543227", points: 5000, hours: 150, status: "ACTIVE" as const, cardUid: "E20000190609", cardType: "RFID" as const },
    { name: "Aditi Iyer", email: "aditi.iyer@demo.unicafe", mobile: "9876543228", points: 150, hours: 0, status: "ACTIVE" as const, cardUid: "E20000190610", cardType: "NFC" as const }, // Zero hours
    { name: "Varun Desai", email: "varun.desai@demo.unicafe", mobile: "9876543229", points: 6400, hours: 110, status: "ACTIVE" as const, cardUid: "E20000190611", cardType: "NFC" as const },
    { name: "Meera Menon", email: "meera.menon@demo.unicafe", mobile: "9876543230", points: 0, hours: 0, status: "INACTIVE" as const, cardUid: "E20000190612", cardType: "VIRTUAL" as const }, // Inactive membership
    { name: "Rohan Bhatia", email: "rohan.bhatia@demo.unicafe", mobile: "9876543231", points: 4100, hours: 135, status: "ACTIVE" as const, cardUid: "E20000190613", cardType: "NFC" as const },
    { name: "Ananya Gupta", email: "ananya.gupta@demo.unicafe", mobile: "9876543232", points: 8900, hours: 150, status: "ACTIVE" as const, cardUid: "E20000190614", cardType: "NFC" as const },
    { name: "Prateek Chadha", email: "prateek.chadha@demo.unicafe", mobile: "9876543233", points: 3100, hours: 72, status: "ACTIVE" as const, cardUid: "E20000190615", cardType: "RFID" as const },
    { name: "Ishaan Kulkarni", email: "ishaan.k@demo.unicafe", mobile: "9876543234", points: 1800, hours: 45, status: "ACTIVE" as const, cardUid: "E20000190616", cardType: "NFC" as const },
    { name: "Simran Kapoor", email: "simran.k@demo.unicafe", mobile: "9876543235", points: 5000, hours: 150, status: "ACTIVE" as const, cardUid: "E20000190617", cardType: "NFC" as const },
    { name: "Kabir Sengupta", email: "kabir.s@demo.unicafe", mobile: "9876543236", points: 2200, hours: 55, status: "ACTIVE" as const, cardUid: "E20000190618", cardType: "RFID" as const },
    { name: "Nisha Pillai", email: "nisha.pillai@demo.unicafe", mobile: "9876543237", points: 9500, hours: 150, status: "ACTIVE" as const, cardUid: "E20000190619", cardType: "NFC" as const },
    { name: "Kunal Chopra", email: "kunal.chopra@demo.unicafe", mobile: "9876543238", points: 3600, hours: 90, status: "ACTIVE" as const, cardUid: "E20000190620", cardType: "NFC" as const },
    { name: "Deepa Nambiar", email: "deepa.n@demo.unicafe", mobile: "9876543239", points: 0, hours: 0, status: "INACTIVE" as const, cardUid: "E20000190621", cardType: "VIRTUAL" as const },
  ];

  const createdCustomers: { user: any; membership: any; card: any }[] = [];

  for (let idx = 0; idx < customerSeeds.length; idx++) {
    const cs = customerSeeds[idx];
    const user = await User.findOneAndUpdate(
      { email: cs.email },
      {
        name: cs.name,
        email: cs.email,
        mobile: cs.mobile,
        passwordHash: demoPw,
        role: "CUSTOMER",
        status: "ACTIVE",
        isDemo: true,
      },
      { upsert: true, new: true }
    );

    const customerCode = `UC${String(100100 + idx)}`;
    await CustomerProfile.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        customerCode,
        preferredCafe: cafeDocs[idx % cafeDocs.length]._id,
        marketingOptIn: true,
        address: { city: idx % 2 === 0 ? "Bengaluru" : "Mumbai", state: idx % 2 === 0 ? "Karnataka" : "Maharashtra", pincode: "560038" },
        isDemo: true,
      },
      { upsert: true }
    );

    const remainingMinutes = cs.hours * 60;
    const rechargeCount = cs.status === "ACTIVE" ? (cs.points > 5000 ? 2 : 1) : 0;
    const membership = await Membership.findOneAndUpdate(
      { customer: user._id },
      {
        customer: user._id,
        status: cs.status,
        pointsBalance: cs.points,
        remainingMinutes,
        totalPointsCredited: rechargeCount * 5000,
        totalPointsSpent: Math.max(0, rechargeCount * 5000 - cs.points),
        totalMinutesUsed: (150 - cs.hours) * 60,
        rechargeCount,
        activatedAt: cs.status === "ACTIVE" ? new Date("2026-01-01") : undefined,
        lastRechargeAt: cs.status === "ACTIVE" ? new Date("2026-03-01") : undefined,
        isDemo: true,
      },
      { upsert: true, new: true }
    );

    const card = await MembershipCard.findOneAndUpdate(
      { customer: user._id },
      {
        cardNumber: `UCM-${String(1000 + idx)}-${String(4000 + idx)}`,
        customer: user._id,
        uid: cs.cardUid,
        cardType: cs.cardType,
        status: cs.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
        assignedCafe: cafeDocs[idx % cafeDocs.length]._id,
        issuedAt: new Date("2026-01-01"),
        lastUsedAt: new Date(),
        lastTapAt: new Date(Date.now() - 3600000),
        history: [{ action: "ISSUED", note: "Demo account card issued" }],
        isDemo: true,
      },
      { upsert: true, new: true }
    );

    createdCustomers.push({ user, membership, card });
  }

  // 8. Demo Payments & Recharge Transactions
  console.log("Seeding Demo Payments & Ledger records...");
  for (let idx = 0; idx < createdCustomers.length; idx++) {
    const c = createdCustomers[idx];
    if (c.membership.status === "ACTIVE") {
      const receipt = `DEMO-PAY-${20260100 + idx}`;
      const payment = await Payment.findOneAndUpdate(
        { receipt },
        {
          customer: c.user._id,
          purpose: "MEMBERSHIP_PURCHASE",
          amount: 5000,
          currency: "INR",
          provider: "DEMO",
          providerOrderId: `demo_order_${idx}`,
          providerPaymentId: `demo_pay_${idx}`,
          receipt,
          status: "SUCCESS",
          processedAt: new Date("2026-01-01"),
          isDemo: true,
        },
        { upsert: true, new: true }
      );

      await MembershipTransaction.findOneAndUpdate(
        { payment: payment._id },
        {
          membership: c.membership._id,
          customer: c.user._id,
          type: "PURCHASE",
          amount: 5000,
          pointsCredited: 5000,
          minutesBefore: 0,
          minutesAfter: 9000,
          pointsBefore: 0,
          pointsAfter: 5000,
          payment: payment._id,
          reference: receipt,
          note: "Demo seeded purchase transaction",
          isDemo: true,
        },
        { upsert: true }
      );

      await PointsLedger.findOneAndUpdate(
        { source: "RECHARGE", refId: payment._id },
        {
          customer: c.user._id,
          membership: c.membership._id,
          type: "CREDIT",
          source: "RECHARGE",
          points: 5000,
          balanceAfter: 5000,
          refModel: "Payment",
          refId: payment._id,
          reference: receipt,
          description: "Initial membership recharge credited",
          isDemo: true,
        },
        { upsert: true }
      );
    }
  }

  // Additional payment samples (FAILED, PENDING, REFUNDED)
  await Payment.findOneAndUpdate(
    { receipt: "DEMO-PAY-FAIL-01" },
    {
      customer: createdCustomers[1].user._id,
      purpose: "MEMBERSHIP_RECHARGE",
      amount: 5000,
      currency: "INR",
      provider: "DEMO",
      providerOrderId: "demo_order_fail_01",
      receipt: "DEMO-PAY-FAIL-01",
      status: "FAILED",
      failureReason: "Card declined by issuing bank (simulated)",
      isDemo: true,
    },
    { upsert: true }
  );

  await Payment.findOneAndUpdate(
    { receipt: "DEMO-PAY-PEND-01" },
    {
      customer: createdCustomers[2].user._id,
      purpose: "MEMBERSHIP_RECHARGE",
      amount: 5000,
      currency: "INR",
      provider: "DEMO",
      providerOrderId: "demo_order_pend_01",
      receipt: "DEMO-PAY-PEND-01",
      status: "PENDING",
      isDemo: true,
    },
    { upsert: true }
  );

  // 9. Demo Orders (At least 30 orders across statuses)
  console.log("Seeding 30+ Demo Orders across multiple statuses & cafes...");
  const orderStatuses = ["COMPLETED", "COMPLETED", "COMPLETED", "READY", "PREPARING", "ACCEPTED", "PENDING", "CANCELLED", "REFUNDED"] as const;

  for (let i = 1; i <= 32; i++) {
    const custObj = createdCustomers[(i - 1) % createdCustomers.length];
    const cafeObj = cafeDocs[(i - 1) % cafeDocs.length];
    const status = orderStatuses[(i - 1) % orderStatuses.length];
    const item1 = menuItemDocs[(i * 2) % menuItemDocs.length];
    const item2 = menuItemDocs[(i * 3) % menuItemDocs.length];
    const totalPts = item1.pointsPrice + item2.pointsPrice * 2;
    const orderNumber = `ORD-202610-${String(1000 + i)}`;

    const order = await Order.findOneAndUpdate(
      { orderNumber },
      {
        orderNumber,
        customer: custObj.user._id,
        cafe: cafeObj._id,
        orderType: i % 3 === 0 ? "PRE_ORDER" : "IN_CAFE",
        status,
        totalPoints: totalPts,
        itemCount: 3,
        notes: i % 4 === 0 ? "Extra hot milk please" : undefined,
        idempotencyKey: `seed_idem_${i}_${orderNumber}`,
        cancelReason: status === "CANCELLED" || status === "REFUNDED" ? "Customer requested cancellation before prep" : undefined,
        refundStatus: status === "CANCELLED" || status === "REFUNDED" ? "REFUNDED" : "NONE",
        refundedPoints: status === "CANCELLED" || status === "REFUNDED" ? totalPts : 0,
        refundedAt: status === "CANCELLED" || status === "REFUNDED" ? new Date() : undefined,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
        statusHistory: [
          { status: "PENDING", at: new Date(Date.now() - 3600000 * 2) },
          { status, at: new Date(Date.now() - 1800000) },
        ],
        createdAt: new Date(Date.now() - (32 - i) * 86400000 * 0.7),
        isDemo: true,
      },
      { upsert: true, new: true }
    );

    await OrderItem.deleteMany({ order: order._id });
    await OrderItem.insertMany([
      { order: order._id, menuItem: item1._id, name: item1.name, unitPoints: item1.pointsPrice, quantity: 1, lineTotal: item1.pointsPrice },
      { order: order._id, menuItem: item2._id, name: item2.name, unitPoints: item2.pointsPrice, quantity: 2, lineTotal: item2.pointsPrice * 2 },
    ]);

    // Ledger debit for order
    await PointsLedger.findOneAndUpdate(
      { source: "ORDER", refId: order._id },
      {
        customer: custObj.user._id,
        membership: custObj.membership._id,
        type: "DEBIT",
        source: "ORDER",
        points: -totalPts,
        balanceAfter: Math.max(0, custObj.membership.pointsBalance),
        refModel: "Order",
        refId: order._id,
        reference: orderNumber,
        description: `Order ${orderNumber} at ${cafeObj.name}`,
        cafe: cafeObj._id,
        isDemo: true,
      },
      { upsert: true }
    );

    // If cancelled / refunded, seed refund ledger
    if (status === "CANCELLED" || status === "REFUNDED") {
      await PointsLedger.findOneAndUpdate(
        { source: "ORDER_REFUND", refId: order._id },
        {
          customer: custObj.user._id,
          membership: custObj.membership._id,
          type: "REFUND",
          source: "ORDER_REFUND",
          points: totalPts,
          balanceAfter: custObj.membership.pointsBalance + totalPts,
          refModel: "Order",
          refId: order._id,
          reference: `RFD-${orderNumber}`,
          description: `Refund for order ${orderNumber}`,
          cafe: cafeObj._id,
          isDemo: true,
        },
        { upsert: true }
      );
    }
  }

  // 10. Demo Visit Sessions (Completed & Active)
  console.log("Seeding Demo Visit Sessions...");
  for (let idx = 0; idx < 15; idx++) {
    const cust = createdCustomers[idx];
    const cafe = cafeDocs[idx % cafeDocs.length];
    const isNowActive = idx === 0 || idx === 1; // 2 active sessions right now

    if (isNowActive) {
      await VisitSession.findOneAndUpdate(
        { customer: cust.user._id, status: "ACTIVE" },
        {
          customer: cust.user._id,
          membership: cust.membership._id,
          card: cust.card._id,
          cafe: cafe._id,
          status: "ACTIVE",
          entryAt: new Date(Date.now() - 45 * 60000), // Checked in 45 mins ago
          minutesBefore: cust.membership.remainingMinutes,
          entryDevice: "SIMULATOR_DESK_01",
          isDemo: true,
        },
        { upsert: true }
      );
    } else {
      const durationMins = 60 + (idx * 15);
      await VisitSession.findOneAndUpdate(
        { customer: cust.user._id, status: "COMPLETED" },
        {
          customer: cust.user._id,
          membership: cust.membership._id,
          card: cust.card._id,
          cafe: cafe._id,
          exitCafe: cafe._id,
          status: "COMPLETED",
          entryAt: new Date(Date.now() - (idx + 1) * 86400000 - durationMins * 60000),
          exitAt: new Date(Date.now() - (idx + 1) * 86400000),
          minutesConsumed: durationMins,
          minutesBefore: cust.membership.remainingMinutes + durationMins,
          minutesAfter: cust.membership.remainingMinutes,
          entryDevice: "DESK_TERMINAL",
          exitDevice: "DESK_TERMINAL",
          isDemo: true,
        },
        { upsert: true }
      );
    }
  }

  // 11. Demo In-App Notifications
  console.log("Seeding sample notifications...");
  await Notification.create([
    {
      user: primaryCustomer._id,
      type: "PAYMENT_CONFIRMATION",
      title: "Membership Purchase Confirmed",
      message: "₹5,000 received. 5,000 points credited and 150 hours activated.",
      link: "/customer/membership",
      isDemo: true,
    },
    {
      user: primaryCustomer._id,
      type: "VISIT_ENTRY",
      title: "Checked into UniCafe Indiranagar",
      message: "Welcome to UniCafe! Your session timer is currently active.",
      link: "/customer/visits",
      isDemo: true,
    },
    {
      user: primaryCustomer._id,
      type: "ORDER_READY",
      title: "Order Ready for Pickup",
      message: "Your order ORD-202610-1001 is hot and ready at the pick-up counter.",
      link: "/customer/orders",
      isDemo: true,
    },
  ]);

  // 12. Audit Logs
  await AuditLog.create([
    {
      actor: adminUser._id,
      actorRole: "SUPER_ADMIN",
      actorName: adminUser.name,
      action: "PLATFORM_INITIALIZED",
      entity: "SystemSetting",
      details: { environment: "development", seeded: true },
    },
  ]);

  console.log("\n============================================================");
  console.log("  UNICAFE SEED COMPLETED SUCCESSFULLY!");
  console.log("============================================================");
  console.log("  Demo Accounts:");
  console.log("  - Super Admin:       admin@unicafe.demo      / Admin@123");
  console.log("  - Area Supervisor:   supervisor@unicafe.demo / Demo@123");
  console.log("  - Franchise Owner:   owner@unicafe.demo      / Demo@123");
  console.log("  - Cafe Manager:      manager@unicafe.demo    / Demo@123");
  console.log("  - Cafe Staff:        staff@unicafe.demo      / Demo@123");
  console.log("  - Customer:          customer@unicafe.demo   / Demo@123");
  console.log("============================================================\n");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seeding failed with error:", err);
  process.exit(1);
});

