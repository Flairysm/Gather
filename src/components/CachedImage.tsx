import { Image, type ImageProps } from "expo-image";

const blurhash = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

export default function CachedImage(props: ImageProps) {
  return (
    <Image
      {...props}
      placeholder={{ blurhash }}
      cachePolicy="memory-disk"
      recyclingKey={typeof props.source === "object" && "uri" in props.source ? props.source.uri : undefined}
      transition={150}
    />
  );
}
