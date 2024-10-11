import { List } from "@raycast/api";
import { resolve } from "path";
import { homedir } from "os";
import { usePromise, executeSQL } from "@raycast/utils";

const NOTES_DB = resolve(homedir(), "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite");
const notesQuery = `
    SELECT
        'x-coredata://' || z_uuid || '/ICNote/p' || xcoreDataID AS id,
        noteTitle AS title,
        datetime(modDate + 978307200, 'unixepoch') AS modifiedAt,
        UUID as UUID
    FROM (
        SELECT
            c.ztitle1 AS noteTitle,
            c.zmodificationdate1 AS modDate,
            c.z_pk AS xcoredataID,
            c.zidentifier AS UUID
        FROM
            ziccloudsyncingobject AS c
        WHERE
            noteTitle IS NOT NULL AND
            modDate IS NOT NULL AND
            xcoredataID IS NOT NULL AND
            c.zmarkedfordeletion != 1
    ) AS notes
    LEFT JOIN (
        SELECT z_uuid FROM z_metadata
    )
    ORDER BY modDate DESC
  `;

type NoteItem = {
  id: string;
  UUID: string;
  title: string;
  modifiedAt?: Date;
};

export default function Command() {
  const { isLoading, data } = usePromise(async () => {
    const result = await executeSQL<NoteItem>(NOTES_DB, notesQuery);
    return result || [];
  });

  return (
    <List isLoading={isLoading}>
      {(data || []).map((item) => (
        <List.Item key={item.id} title={item.title} />
      ))}
    </List>
  );
}
