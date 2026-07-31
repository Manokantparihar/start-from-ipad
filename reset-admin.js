const bcrypt = require("bcryptjs");
const db = require("./src/utils/db");



(async () => {
  const users = await db.getUsers();

  const admin = users.find(
    u => u.email === "manokant2002@gmail.com"
  );

  if (!admin) {
    console.log("Admin not found");
    process.exit(1);
  }

  admin.password = await bcrypt.hash("Admin@12345", 10);

  await db.saveUsers(users);

  console.log("✅ Password reset successful!");
  console.log("Email: manokant2002@gmail.com");
  console.log("Password: Admin@12345");

  process.exit(0);
})();

