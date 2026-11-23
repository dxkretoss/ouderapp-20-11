const lijst = [];
export function voegChatAfspraakToe(a) {
    const id = `chat-${Date.now()}`;
    lijst.push({ ...a, id, gedeeld: true, categorie: "overig" });
    return id;
}
export const leesChatAfspraken = () => [...lijst];
