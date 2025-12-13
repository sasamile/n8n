-- AlterEnum - Add new node types
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SWITCH' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NodeType')) THEN
        ALTER TYPE "NodeType" ADD VALUE 'SWITCH';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'IMAGE_TO_TEXT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NodeType')) THEN
        ALTER TYPE "NodeType" ADD VALUE 'IMAGE_TO_TEXT';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'AUDIO_TO_TEXT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NodeType')) THEN
        ALTER TYPE "NodeType" ADD VALUE 'AUDIO_TO_TEXT';
    END IF;
END $$;

