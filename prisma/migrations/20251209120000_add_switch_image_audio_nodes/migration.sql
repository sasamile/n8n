-- AlterEnum - Add new node types
-- Note: These are added one at a time because PostgreSQL requires it
DO $$ 
BEGIN
    -- Add SWITCH if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SWITCH' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NodeType')) THEN
        ALTER TYPE "NodeType" ADD VALUE 'SWITCH';
    END IF;
    
    -- Add IMAGE_TO_TEXT if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'IMAGE_TO_TEXT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NodeType')) THEN
        ALTER TYPE "NodeType" ADD VALUE 'IMAGE_TO_TEXT';
    END IF;
    
    -- Add AUDIO_TO_TEXT if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'AUDIO_TO_TEXT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NodeType')) THEN
        ALTER TYPE "NodeType" ADD VALUE 'AUDIO_TO_TEXT';
    END IF;
END $$;






