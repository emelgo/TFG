'use client';

import { useCallback, useState } from 'react';

import { Image as ImageIcon } from 'lucide-react';

import { Button } from '../shadcn/button';
import { ImageUploadInput } from './image-upload-input';
import { Trans } from './trans';

export function ImageUploader(
  props: React.PropsWithChildren<{
    value: string | null | undefined;
    onValueChange: (value: File | null) => unknown;
  }>,
) {
  const [image, setImage] = useState(props.value);

  const onClear = useCallback(() => {
    props.onValueChange(null);
    setImage('');
  }, [props]);

  const onValueChange = useCallback(
    ({ image, file }: { image: string; file: File }) => {
      props.onValueChange(file);

      setImage(image);
    },
    [props],
  );

  if (props.value !== image) {
    setImage(props.value);
  }

  if (!image) {
    return (
      <FallbackImage descriptionSection={props.children}>
        <ImageUploadInput
          name={'value'}
          accept={'image/*'}
          className={'absolute h-full w-full'}
          visible={false}
          multiple={false}
          onValueChange={onValueChange}
        />
      </FallbackImage>
    );
  }

  return (
    <div className={'flex items-center space-x-4'}>
      <label
        className={
          'animate-in fade-in zoom-in-50 group/label relative h-20 w-20 cursor-pointer'
        }
      >
        <img
          decoding="async"
          className={
            'h-20 w-20 rounded-full object-cover transition-all duration-300 group-hover/label:opacity-80'
          }
          src={image}
          alt={''}
        />

        <ImageUploadInput
          name={'value'}
          accept={'image/*'}
          className={'absolute h-full w-full'}
          visible={false}
          multiple={false}
          onValueChange={onValueChange}
        />
      </label>

      <div>
        <Button onClick={onClear} size={'sm'} variant={'ghost'}>
          <Trans i18nKey={'common.clear'} />
        </Button>
      </div>
    </div>
  );
}

function FallbackImage(
  props: React.PropsWithChildren<{
    descriptionSection?: React.ReactNode;
  }>,
) {
  return (
    <div className={'flex items-center space-x-4'}>
      <label
        className={
          'border-border animate-in fade-in zoom-in-50 hover:border-primary relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-full border'
        }
      >
        <ImageIcon className={'text-primary h-8'} />

        {props.children}
      </label>

      {props.descriptionSection}
    </div>
  );
}
