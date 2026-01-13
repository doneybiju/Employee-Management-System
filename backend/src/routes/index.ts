// backend/src/routes/index.ts
import { Router } from "express";

// Импорты роутеров (в файлах должно быть `export default router`)
import adminRouter from "./admin";
import authRouter from "./auth";
import avatarRouter from "./avatar";
import departmentsRouter from "./departments";
import deprovisionRouter from "./deprovision";
import gsuiteRouter from "./gsuite";
import internsRouter from "./interns";
import overtimeRouter from "./overtime";
import profileRouter from "./profile";
import publicInternsRouter from "./public-interns";
import statsRouter from "./stats";
import uploadsRouter from "./uploads";
import usersRouter from "./users";


const api = Router();

// Префиксы согласно названию файлов
api.use("/admin", adminRouter);
api.use("/auth", authRouter);
api.use("/avatar", avatarRouter);
api.use("/departments", departmentsRouter);
api.use("/deprovision", deprovisionRouter);
api.use("/gsuite", gsuiteRouter);
api.use("/interns", internsRouter);
api.use("/overtime", overtimeRouter);
api.use("/profile", profileRouter);
api.use("/public", publicInternsRouter);
api.use("/stats", statsRouter);
api.use("/uploads", uploadsRouter);
api.use("/users", usersRouter);

// Простой health
api.get("/health", (_req, res) => res.json({ ok: true }));

export default api;
