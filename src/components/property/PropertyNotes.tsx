import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  usePropertyNotes,
  useCreatePropertyNote,
  useUpdatePropertyNote,
  useDeletePropertyNote,
} from "@/hooks/usePropertyNotes";

interface PropertyNotesProps {
  propertyId: string;
}

export function PropertyNotes({ propertyId }: PropertyNotesProps) {
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: notesRaw } = usePropertyNotes({ propertyId });
  const notes = (notesRaw ?? []).slice().sort(
    (a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );

  const createNote = useCreatePropertyNote();
  const updateNote = useUpdatePropertyNote();
  const deleteNote = useDeletePropertyNote();

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      await createNote.mutateAsync({ property_id: propertyId, content: newNote } as any);
      toast.success("Anteckning tillagd");
      setNewNote("");
    } catch {
      toast.error("Kunde inte lägga till anteckning");
    }
  };

  const handleUpdateNote = async (id: string) => {
    try {
      await updateNote.mutateAsync({ id, patch: { content: editContent } as any });
      toast.success("Anteckning uppdaterad");
      setEditingId(null);
    } catch {
      toast.error("Kunde inte uppdatera anteckning");
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote.mutateAsync(id);
      toast.success("Anteckning borttagen");
    } catch {
      toast.error("Kunde inte ta bort anteckning");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Textarea
          placeholder="Skriv en ny anteckning..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[100px]"
        />
        <Button onClick={handleAddNote} disabled={!newNote.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Lägg till
        </Button>
      </div>

      <div className="space-y-2">
        {notes && notes.length > 0 ? (
          notes.map((note: any) => (
            <Card key={note.id}>
              <CardContent className="pt-4">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[100px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateNote(note.id)}>
                        <Save className="h-4 w-4 mr-2" />
                        Spara
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Avbryt
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(note.created_at), "yyyy-MM-dd HH:mm", { locale: sv })}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditContent(note.content);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga anteckningar ännu
          </div>
        )}
      </div>
    </div>
  );
}
