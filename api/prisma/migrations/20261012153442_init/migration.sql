-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "seguranca";

-- CreateTable
CREATE TABLE "seguranca"."email_change_tokens" (
    "id" BIGSERIAL NOT NULL,
    "new_email" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(0) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "email_change_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."user_access_history" (
    "id" BIGSERIAL NOT NULL,
    "jti" VARCHAR(36),
    "login_at" TIMESTAMP(0) NOT NULL,
    "logout_at" TIMESTAMP(0),
    "session_duration" INTEGER,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "user_id" TEXT,

    CONSTRAINT "user_access_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "login" VARCHAR(90) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "requires_relogin" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "phone" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."permissions" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguranca"."role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_change_tokens_user_id_idx" ON "seguranca"."email_change_tokens"("user_id");

-- CreateIndex
CREATE INDEX "user_access_history_login_at_index" ON "seguranca"."user_access_history"("login_at");

-- CreateIndex
CREATE INDEX "user_access_history_jti_index" ON "seguranca"."user_access_history"("jti");

-- CreateIndex
CREATE INDEX "user_access_history_user_id_idx" ON "seguranca"."user_access_history"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "seguranca"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "seguranca"."users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "seguranca"."password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "seguranca"."password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "seguranca"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_identifier_key" ON "seguranca"."permissions"("identifier");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "seguranca"."user_roles"("userId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "seguranca"."user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "seguranca"."user_roles"("userId", "roleId");

-- CreateIndex
CREATE INDEX "user_permissions_userId_idx" ON "seguranca"."user_permissions"("userId");

-- CreateIndex
CREATE INDEX "user_permissions_permissionId_idx" ON "seguranca"."user_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permissionId_key" ON "seguranca"."user_permissions"("userId", "permissionId");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "seguranca"."role_permissions"("roleId");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "seguranca"."role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "seguranca"."role_permissions"("roleId", "permissionId");

-- AddForeignKey
ALTER TABLE "seguranca"."email_change_tokens" ADD CONSTRAINT "email_change_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "seguranca"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "seguranca"."user_access_history" ADD CONSTRAINT "user_access_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "seguranca"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "seguranca"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "seguranca"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguranca"."user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "seguranca"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguranca"."user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "seguranca"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguranca"."user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "seguranca"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguranca"."user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "seguranca"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguranca"."role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "seguranca"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguranca"."role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "seguranca"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

