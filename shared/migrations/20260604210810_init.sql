-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "consent_flags" JSONB NOT NULL DEFAULT '{}',
    "plan" VARCHAR(20) NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "input_mode" VARCHAR(10) NOT NULL DEFAULT 'form',
    "raw_text" TEXT,
    "study_program" TEXT,
    "budget_max" INTEGER,
    "rooms_min" DOUBLE PRECISION,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "radius_km" INTEGER NOT NULL DEFAULT 10,
    "move_in_from" DATE,
    "move_in_flexible" BOOLEAN NOT NULL DEFAULT true,
    "furnished_pref" BOOLEAN,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vibe" VARCHAR(10),
    "max_flatmates" INTEGER,
    "pets_ok" BOOLEAN,
    "smoking_ok" BOOLEAN,
    "gender_pref" VARCHAR(15),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "offer_type" VARCHAR(20) NOT NULL,
    "object_category" VARCHAR(20) NOT NULL,
    "object_type" VARCHAR(30),
    "rent_net" DOUBLE PRECISION,
    "rent_charges" DOUBLE PRECISION,
    "rent_gross" DOUBLE PRECISION,
    "surface_living" DOUBLE PRECISION,
    "number_of_rooms" DOUBLE PRECISION,
    "floor" INTEGER,
    "is_furnished" BOOLEAN,
    "is_temporary" BOOLEAN,
    "moving_date" DATE,
    "moving_date_type" VARCHAR(20),
    "zipcode" VARCHAR(10),
    "city" VARCHAR(100),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "description" TEXT,
    "short_title" TEXT,
    "public_title" TEXT,
    "published" TIMESTAMP(3),
    "reserved" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_attributes" (
    "listing_id" INTEGER NOT NULL,
    "flatmate_count" INTEGER,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vibe" VARCHAR(10),
    "pets" BOOLEAN,
    "smoking" BOOLEAN,
    "gender_pref" VARCHAR(15),
    "move_in_flexible" BOOLEAN,
    "extraction_model" VARCHAR(50),
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_attributes_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" INTEGER,
    "score" DOUBLE PRECISION NOT NULL,
    "score_breakdown" JSONB NOT NULL DEFAULT '{}',
    "rationale" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "listing_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "language" VARCHAR(5) NOT NULL,
    "mode" VARCHAR(10) NOT NULL DEFAULT 'review',
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "listings_city_rent_gross_number_of_rooms_idx" ON "listings"("city", "rent_gross", "number_of_rooms");

-- CreateIndex
CREATE INDEX "listings_status_published_idx" ON "listings"("status", "published");

-- CreateIndex
CREATE INDEX "matches_user_id_status_idx" ON "matches"("user_id", "status");

-- CreateIndex
CREATE INDEX "matches_score_idx" ON "matches"("score");

-- CreateIndex
CREATE UNIQUE INDEX "matches_user_id_listing_id_key" ON "matches"("user_id", "listing_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_attributes" ADD CONSTRAINT "listing_attributes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
