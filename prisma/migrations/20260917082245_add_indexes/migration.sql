-- CreateIndex
CREATE INDEX "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_action_createdAt_idx" ON "Activity"("action", "createdAt");

-- CreateIndex
CREATE INDEX "File_updatedAt_idx" ON "File"("updatedAt");

-- CreateIndex
CREATE INDEX "File_uploadedById_idx" ON "File"("uploadedById");

-- CreateIndex
CREATE INDEX "Permission_fileId_idx" ON "Permission"("fileId");

-- CreateIndex
CREATE INDEX "Permission_folderId_idx" ON "Permission"("folderId");

-- CreateIndex
CREATE INDEX "Permission_userId_idx" ON "Permission"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
