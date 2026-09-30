import {
  ArchiveIcon,
  CodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
} from 'lucide-react';

import type { StorageFileType } from '@pymekit/cms-shared/storage-paths';
import { cn } from '@pymekit/ui/utils';

const ICONS: Record<StorageFileType, typeof FileIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: MusicIcon,
  document: FileTextIcon,
  archive: ArchiveIcon,
  code: CodeIcon,
  file: FileIcon,
};

export function FileTypeIcon(props: {
  fileType: StorageFileType;
  isDirectory: boolean;
  className?: string;
}) {
  const Icon = props.isDirectory ? FolderIcon : ICONS[props.fileType];

  return <Icon className={cn('text-muted-foreground', props.className)} />;
}
