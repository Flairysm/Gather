import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { C } from "../theme";
import { feed as f } from "../styles/feed.styles";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";
import {
  createPost,
  uploadPostMedia,
  moderatePostMedia,
  deletePostMedia,
  POST_MAX_CHARS,
} from "../data/feed";

const MAX_IMAGES = 4;

type Props = { onBack: () => void };

export default function PostComposerScreen({ onBack }: Props) {
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setSignedIn(!!user);
    });
    return () => { cancelled = true; };
  }, []);

  function handleClose() {
    if (body.trim().length > 0 || images.length > 0) {
      Alert.alert("Discard post?", "Your draft will be lost.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onBack },
      ]);
      return;
    }
    onBack();
  }

  const charCount = body.length;
  const nearCharLimit = charCount > POST_MAX_CHARS * 0.9;
  const canPost = (body.trim().length > 0 || images.length > 0) && !submitting;

  async function pickImages() {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, MAX_IMAGES));
    }
  }

  async function handlePost() {
    if (!canPost) return;
    if (!(await requireNetwork())) return;
    setSubmitting(true);
    try {
      const mediaUrls = images.length > 0 ? await uploadPostMedia(images) : [];
      if (mediaUrls.length > 0) {
        const mod = await moderatePostMedia(mediaUrls);
        if (!mod.allowed) {
          await deletePostMedia(mediaUrls).catch(() => {});
          throw new Error(
            mod.reason === "too_many"
              ? `You can attach up to ${MAX_IMAGES} images.`
              : "One or more images look inappropriate and can't be posted. Please choose different images.",
          );
        }
      }
      await createPost(body.trim(), mediaUrls, isAnonymous);
      onBack();
    } catch (err: any) {
      Alert.alert("Can't post", err?.message ?? "Failed to publish post.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn === null) {
    return (
      <SafeAreaView style={f.safe}>
        <StatusBar style="light" />
        <View style={f.centerState}>
          <ActivityIndicator color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={f.safe}>
        <StatusBar style="light" />
        <View style={f.header}>
          <Pressable style={f.headerBtn} onPress={onBack}>
            <Feather name="x" size={20} color={C.textSearch} />
          </Pressable>
          <Text style={f.headerTitle}>New Post</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={f.centerState}>
          <View style={f.emptyIconWrap}>
            <Ionicons name="lock-closed-outline" size={32} color={C.textSecondary} />
          </View>
          <Text style={f.emptyTitle}>Sign in to post</Text>
          <Text style={f.emptySub}>You need an account to share with the community.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={f.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={f.header}>
          <Pressable style={f.headerBtn} onPress={handleClose}>
            <Feather name="x" size={20} color={C.textSearch} />
          </Pressable>
          <Text style={f.headerTitle}>New Post</Text>
          <Pressable
            style={[f.postBtn, !canPost && f.postBtnDisabled]}
            onPress={handlePost}
            disabled={!canPost}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <Text style={[f.postBtnText, !canPost && f.postBtnTextDisabled]}>Post</Text>
            )}
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          <TextInput
            style={f.composerInput}
            value={body}
            onChangeText={setBody}
            placeholder="Share something with collectors…"
            placeholderTextColor={C.textMuted}
            multiline
            autoFocus
            maxLength={POST_MAX_CHARS}
          />

          {images.length > 0 ? (
            <View style={f.thumbRow}>
              {images.map((uri, i) => (
                <View key={`${uri}-${i}`}>
                  <Image source={{ uri }} style={f.thumb} />
                  <Pressable
                    style={f.thumbRemove}
                    onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    hitSlop={8}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={f.composerToolbar}>
          <Pressable style={f.toolbarBtn} onPress={pickImages}>
            <Feather name="image" size={20} color={C.textAccent} />
            <Text style={f.toolbarBtnText}>
              Photo{images.length > 0 ? ` (${images.length}/${MAX_IMAGES})` : ""}
            </Text>
          </Pressable>

          <Text
            style={[f.composerCounter, nearCharLimit && f.composerCounterOver]}
          >
            {charCount}/{POST_MAX_CHARS}
          </Text>

          <View style={f.anonToggle}>
            <Ionicons
              name={isAnonymous ? "eye-off" : "eye-off-outline"}
              size={16}
              color={isAnonymous ? C.textAccent : C.textSecondary}
            />
            <Text style={f.anonToggleLabel}>Anonymous</Text>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: C.muted, true: C.accentSoft }}
              thumbColor={isAnonymous ? C.accent : "#f4f3f4"}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
