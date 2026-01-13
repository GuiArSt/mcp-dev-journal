"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MermaidEditor } from "@/components/multimedia/MermaidEditor";
import {
  Image as ImageIcon,
  FileCode,
  Upload,
  Grid3X3,
  List,
  Plus,
  Download,
  Trash2,
  Loader2,
  ExternalLink,
  Cloud,
  Sparkles,
  BookOpen,
  Filter,
} from "lucide-react";
import { formatDateShort } from "@/lib/utils";

interface StorageImage {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: Record<string, unknown>;
  publicUrl?: string; // We'll populate this from Supabase
}

interface JournalAttachment {
  id: number;
  commit_hash: string;
  filename: string;
  mime_type: string;
  description?: string;
  size: number;
  created_at: string;
}

interface MediaAsset {
  id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  description?: string;
  prompt?: string;
  model?: string;
  tags: string;
  destination: string;
  commit_hash?: string;
  document_id?: number;
  created_at: string;
  data?: string; // base64 image data (only when fetched with include_data)
}

type MediaFilter = "all" | "ai-generated" | "journal" | "standalone";

export default function MultimediaPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [images, setImages] = useState<StorageImage[]>([]);
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<StorageImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [selectedAttachment, setSelectedAttachment] = useState<JournalAttachment | null>(null);
  const [attachmentData, setAttachmentData] = useState<string | null>(null);

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);
  const [mediaImageData, setMediaImageData] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  useEffect(() => {
    checkStorage();
    loadJournalAttachments();
    loadMediaAssets();
  }, []);

  const checkStorage = async () => {
    try {
      const response = await fetch("/api/storage");
      const data = await response.json();
      setIsSupabaseConfigured(data.configured);
      if (data.supabaseUrl) {
        setSupabaseUrl(data.supabaseUrl);
      }
      // Add public URLs to images
      const imagesWithUrls = (data.images || []).map((img: StorageImage) => ({
        ...img,
        publicUrl: data.supabaseUrl
          ? `${data.supabaseUrl}/storage/v1/object/public/journal-images/uploads/${img.name}`
          : undefined,
      }));
      setImages(imagesWithUrls);
    } catch (error) {
      console.error("Failed to check storage:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadJournalAttachments = async () => {
    try {
      const response = await fetch("/api/attachments");
      const data = await response.json();
      setAttachments(data.attachments || []);
    } catch (error) {
      console.error("Failed to load attachments:", error);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const loadMediaAssets = async () => {
    try {
      const response = await fetch("/api/media?limit=100");
      const data = await response.json();
      const assets = data.assets || [];
      setMediaAssets(assets);

      // Load thumbnails for image assets (lazy load in batches)
      loadThumbnails(assets);
    } catch (error) {
      console.error("Failed to load media assets:", error);
    } finally {
      setLoadingMedia(false);
    }
  };

  const loadThumbnails = async (assets: MediaAsset[]) => {
    // Load thumbnails in parallel (limit to first 20 for performance)
    const imageAssets = assets.filter(a => a.mime_type.startsWith("image/")).slice(0, 20);

    const results = await Promise.allSettled(
      imageAssets.map(async (asset) => {
        const res = await fetch(`/api/media/${asset.id}?include_data=true`);
        const data = await res.json();
        return { id: asset.id, data: data.data };
      })
    );

    const thumbMap: Record<number, string> = {};
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value.data) {
        thumbMap[result.value.id] = result.value.data;
      }
    });
    setThumbnails(thumbMap);
  };

  const viewMediaAsset = async (asset: MediaAsset) => {
    setSelectedMedia(asset);
    // If we already have the thumbnail, use it immediately while loading full res
    if (thumbnails[asset.id]) {
      setMediaImageData(thumbnails[asset.id]);
    }
    try {
      const response = await fetch(`/api/media/${asset.id}?include_data=true`);
      const data = await response.json();
      setMediaImageData(data.data || null);
    } catch (error) {
      console.error("Failed to load media asset:", error);
    }
  };

  const deleteMediaAsset = async (id: number) => {
    if (!confirm("Delete this media asset?")) return;
    try {
      await fetch(`/api/media/${id}`, { method: "DELETE" });
      loadMediaAssets();
      setSelectedMedia(null);
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", `uploads/${Date.now()}-${file.name}`);
      const response = await fetch("/api/storage", { method: "POST", body: formData });
      if (response.ok) checkStorage();
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  const viewAttachment = async (attachment: JournalAttachment) => {
    setSelectedAttachment(attachment);
    try {
      const response = await fetch(`/api/attachments/${attachment.id}?include_data=true`);
      const data = await response.json();
      setAttachmentData(data.data_base64 || null);
    } catch (error) {
      console.error("Failed to load attachment:", error);
    }
  };

  const isMermaid = (filename: string, mimeType: string) => filename.endsWith(".mmd") || (mimeType === "text/plain" && filename.includes("mermaid"));
  const isImage = (mimeType: string) => mimeType.startsWith("image/");

  const filteredMedia = mediaAssets.filter((asset) => {
    switch (mediaFilter) {
      case "ai-generated": return !!asset.prompt;
      case "journal": return !!asset.commit_hash;
      case "standalone": return !asset.commit_hash && !asset.document_id;
      default: return true;
    }
  });

  const mermaidAttachments = attachments.filter((a) => isMermaid(a.filename, a.mime_type));
  const totalMedia = mediaAssets.length;
  const aiGeneratedCount = mediaAssets.filter((a) => !!a.prompt).length;
  const journalLinkedCount = mediaAssets.filter((a) => !!a.commit_hash).length;

  return (
    <div className="journal-page flex h-full flex-col">
      <header className="journal-header flex h-14 items-center justify-between px-6">
        <h1 className="journal-title text-lg">Multimedia</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
          </Button>
          <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
        </div>
      </header>

      <Tabs defaultValue="media" className="flex flex-1 flex-col">
        <div className="journal-tabs px-6">
          <TabsList className="h-12">
            <TabsTrigger value="media" className="gap-2">
              <ImageIcon className="h-4 w-4" />Media Library
              {totalMedia > 0 && <Badge variant="secondary" className="ml-1">{totalMedia}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="diagrams" className="gap-2">
              <FileCode className="h-4 w-4" />Diagrams
              {mermaidAttachments.length > 0 && <Badge variant="secondary" className="ml-1">{mermaidAttachments.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="cloud" className="gap-2">
              <Cloud className="h-4 w-4" />Cloud
              {isSupabaseConfigured && images.length > 0 && <Badge variant="secondary" className="ml-1">{images.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <Plus className="h-4 w-4" />Create Diagram
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 bg-[var(--journal-paper)]">
          <TabsContent value="media" className="mt-0 p-6">
            <div className="flex items-center justify-between mb-6">
              <Select value={mediaFilter} onValueChange={(v) => setMediaFilter(v as MediaFilter)}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Media ({totalMedia})</SelectItem>
                  <SelectItem value="ai-generated"><Sparkles className="h-3 w-3 mr-2 inline" />AI Generated ({aiGeneratedCount})</SelectItem>
                  <SelectItem value="journal"><BookOpen className="h-3 w-3 mr-2 inline" />Journal Linked ({journalLinkedCount})</SelectItem>
                  <SelectItem value="standalone">Standalone</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{filteredMedia.length} item{filteredMedia.length !== 1 ? "s" : ""}</p>
            </div>

            {loadingMedia ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : filteredMedia.length === 0 ? (
              <div className="py-12 text-center">
                <ImageIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold">No media found</h3>
                <p className="text-sm text-muted-foreground">{mediaFilter === "all" ? "Ask Kronus to generate an image!" : "No items match this filter."}</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredMedia.map((asset) => (
                  <Card key={asset.id} className="cursor-pointer overflow-hidden hover:ring-2 hover:ring-primary transition-all" onClick={() => viewMediaAsset(asset)}>
                    <div className="flex aspect-square items-center justify-center bg-muted relative overflow-hidden">
                      {thumbnails[asset.id] ? (
                        <img
                          src={`data:${asset.mime_type};base64,${thumbnails[asset.id]}`}
                          alt={asset.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-12 w-12 text-muted-foreground" />
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {asset.prompt && <Badge className="text-xs" variant="secondary"><Sparkles className="h-3 w-3" /></Badge>}
                        {asset.commit_hash && <Badge className="text-xs" variant="outline"><BookOpen className="h-3 w-3" /></Badge>}
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <p className="truncate text-sm font-medium">{asset.filename}</p>
                      <p className="text-xs text-muted-foreground truncate">{asset.description || asset.prompt?.substring(0, 40) || "No description"}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{Math.round(asset.file_size / 1024)} KB</span>
                        <span className="text-xs text-muted-foreground">{formatDateShort(asset.created_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMedia.map((asset) => (
                  <Card key={asset.id} className="p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => viewMediaAsset(asset)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                          {thumbnails[asset.id] ? (
                            <img
                              src={`data:${asset.mime_type};base64,${thumbnails[asset.id]}`}
                              alt={asset.filename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{asset.filename}</p>
                          <p className="text-xs text-muted-foreground">{asset.description || asset.prompt?.substring(0, 60) || "No description"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {asset.prompt && <Badge variant="secondary"><Sparkles className="h-3 w-3 mr-1" />AI</Badge>}
                        {asset.commit_hash && <Badge variant="outline"><BookOpen className="h-3 w-3 mr-1" />Journal</Badge>}
                        <span className="text-sm text-muted-foreground">{Math.round(asset.file_size / 1024)} KB</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="diagrams" className="mt-0 p-6">
            {loadingAttachments ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : mermaidAttachments.length === 0 ? (
              <div className="py-12 text-center">
                <FileCode className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold">No diagrams yet</h3>
                <p className="text-sm text-muted-foreground">Create a new diagram or attach one to a journal entry</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {mermaidAttachments.map((attachment) => (
                  <Card key={attachment.id} className="cursor-pointer overflow-hidden hover:ring-2 hover:ring-primary transition-all" onClick={() => viewAttachment(attachment)}>
                    <div className="flex aspect-video items-center justify-center bg-muted"><FileCode className="h-12 w-12 text-muted-foreground" /></div>
                    <CardContent className="p-3">
                      <p className="truncate text-sm font-medium">{attachment.filename}</p>
                      <p className="text-xs text-muted-foreground">{attachment.description || `Commit: ${attachment.commit_hash.substring(0, 7)}`}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cloud" className="mt-0 p-6">
            {!isSupabaseConfigured ? (
              <div className="py-12 text-center">
                <Cloud className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold">Cloud storage not configured</h3>
                <p className="text-sm text-muted-foreground mb-4">Set up Supabase to enable cloud storage</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : images.length === 0 ? (
              <div className="py-12 text-center">
                <Cloud className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold">No cloud images</h3>
                <Button onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Upload</Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {images.map((image) => (
                  <Card key={image.id} className="cursor-pointer overflow-hidden hover:ring-2 hover:ring-primary" onClick={() => setSelectedImage(image)}>
                    <div className="flex aspect-square items-center justify-center bg-muted overflow-hidden">
                      {image.publicUrl ? (
                        <img
                          src={image.publicUrl}
                          alt={image.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to placeholder on error
                            (e.target as HTMLImageElement).style.display = "none";
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                      ) : null}
                      <ImageIcon className={`h-12 w-12 text-muted-foreground ${image.publicUrl ? "hidden" : ""}`} />
                    </div>
                    <CardContent className="p-3">
                      <p className="truncate text-sm font-medium">{image.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateShort(image.created_at)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-0 h-full">
            <div className="p-6 h-[calc(100vh-14rem)]"><MermaidEditor /></div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <Dialog open={!!selectedAttachment} onOpenChange={() => { setSelectedAttachment(null); setAttachmentData(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{selectedAttachment?.filename}<Badge variant="outline">{selectedAttachment?.mime_type}</Badge></DialogTitle></DialogHeader>
          {selectedAttachment && (
            <div>
              {selectedAttachment.description && <p className="text-sm text-muted-foreground mb-4">{selectedAttachment.description}</p>}
              {attachmentData ? (
                isMermaid(selectedAttachment.filename, selectedAttachment.mime_type) ? <MermaidEditor initialCode={atob(attachmentData)} readOnly={true} />
                : isImage(selectedAttachment.mime_type) ? <img src={`data:${selectedAttachment.mime_type};base64,${attachmentData}`} alt={selectedAttachment.filename} className="max-w-full rounded-lg" />
                : <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-96">{atob(attachmentData)}</pre>
              ) : <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">Commit: <code className="bg-muted px-1 rounded">{selectedAttachment.commit_hash.substring(0, 7)}</code></div>
                <Button variant="outline" size="sm" asChild><a href={`/reader/${selectedAttachment.commit_hash}`}><ExternalLink className="h-4 w-4 mr-1" />View Entry</a></Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedMedia} onOpenChange={() => { setSelectedMedia(null); setMediaImageData(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{selectedMedia?.filename}{selectedMedia?.prompt && <Badge variant="secondary"><Sparkles className="h-3 w-3 mr-1" />AI</Badge>}{selectedMedia?.model && <Badge variant="outline">{selectedMedia.model.split("/").pop()}</Badge>}</DialogTitle></DialogHeader>
          {selectedMedia && (
            <div>
              {selectedMedia.description && <p className="text-sm text-muted-foreground mb-2">{selectedMedia.description}</p>}
              {selectedMedia.prompt && <p className="text-sm italic text-muted-foreground mb-4 bg-muted p-2 rounded"><span className="font-medium not-italic">Prompt:</span> {selectedMedia.prompt}</p>}
              {mediaImageData ? <img src={`data:${selectedMedia.mime_type};base64,${mediaImageData}`} alt={selectedMedia.filename} className="max-w-full rounded-lg" /> : <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">{selectedMedia.commit_hash && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />Linked: <code className="bg-muted px-1 rounded">{selectedMedia.commit_hash.substring(0, 7)}</code></span>}</div>
                <div className="flex gap-2">
                  {selectedMedia.commit_hash && <Button variant="outline" size="sm" asChild><a href={`/reader/${selectedMedia.commit_hash}`}><ExternalLink className="h-4 w-4 mr-1" />Entry</a></Button>}
                  {mediaImageData && <Button variant="outline" size="sm" asChild><a href={`data:${selectedMedia.mime_type};base64,${mediaImageData}`} download={selectedMedia.filename}><Download className="h-4 w-4 mr-1" />Download</a></Button>}
                  <Button variant="destructive" size="sm" onClick={() => deleteMediaAsset(selectedMedia.id)}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{selectedImage?.name}<Badge variant="outline">Cloud Storage</Badge></DialogTitle></DialogHeader>
          {selectedImage && (
            <div>
              {selectedImage.publicUrl ? (
                <img
                  src={selectedImage.publicUrl}
                  alt={selectedImage.name}
                  className="max-w-full rounded-lg"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                  <ImageIcon className="h-24 w-24 text-muted-foreground" />
                </div>
              )}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Created: {new Date(selectedImage.created_at).toLocaleString()}
                </div>
                <div className="flex gap-2">
                  {selectedImage.publicUrl && (
                    <>
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedImage.publicUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />Open
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedImage.publicUrl} download={selectedImage.name}>
                          <Download className="h-4 w-4 mr-1" />Download
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
