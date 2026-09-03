# serve.rb — fallback static server using only Ruby's stdlib socket library.
#
# The obvious one-liner, `ruby -run -e httpd`, needs WEBrick, which stopped
# being a default gem in Ruby 3.0. macOS still ships Ruby 2.6, where it would
# work — but relying on a deprecated interpreter's bundled gem is how a tool
# breaks on the next OS release. This uses only `socket`, present in every
# Ruby since forever.
#
#   ruby serve.rb [port]

require 'socket'

PORT = (ARGV[0] || 8099).to_i
ROOT = File.expand_path(File.dirname(__FILE__))

# The app is ES modules; a browser refuses a module served as text/plain.
TYPES = {
  '.html' => 'text/html; charset=utf-8', '.htm' => 'text/html; charset=utf-8',
  '.js' => 'text/javascript; charset=utf-8', '.mjs' => 'text/javascript; charset=utf-8',
  '.css' => 'text/css; charset=utf-8', '.json' => 'application/json; charset=utf-8',
  '.txt' => 'text/plain; charset=utf-8', '.md' => 'text/plain; charset=utf-8',
  '.svg' => 'image/svg+xml', '.png' => 'image/png', '.jpg' => 'image/jpeg',
  '.jpeg' => 'image/jpeg', '.gif' => 'image/gif', '.ico' => 'image/x-icon',
  '.woff' => 'font/woff', '.woff2' => 'font/woff2', '.wasm' => 'application/wasm',
  '.pdf' => 'application/pdf'
}.freeze

def respond(client, status, type, body)
  client.print "HTTP/1.1 #{status}\r\n"
  client.print "Content-Type: #{type}\r\n"
  # Never cache: a stale module would leave a replaced folder looking unchanged.
  client.print "Cache-Control: no-store, must-revalidate\r\n"
  client.print "Pragma: no-cache\r\n"
  client.print "Content-Length: #{body.bytesize}\r\n"
  client.print "Connection: close\r\n\r\n"
  client.print body
end

server = TCPServer.new('127.0.0.1', PORT)
puts "Serving #{ROOT} on http://localhost:#{PORT}"

loop do
  begin
    client = server.accept
    request = client.gets
    next (client.close rescue nil) if request.nil?

    # Read and discard the remaining headers so the client is not left waiting.
    while (line = client.gets) && line.strip != ''; end

    path = request.split(' ')[1].to_s.split('?').first.to_s
    path = begin
      path.gsub(/%([0-9A-Fa-f]{2})/) { [Regexp.last_match(1)].pack('H2') }
    rescue StandardError
      path
    end
    path = 'index.html' if path.nil? || path.empty? || path == '/'
    full = File.expand_path(File.join(ROOT, path.sub(%r{\A/}, '')))
    full = File.join(full, 'index.html') if File.directory?(full)

    # Trailing separator: a sibling folder starting with the same characters
    # would otherwise satisfy the prefix test.
    if full != ROOT && !full.start_with?(ROOT + File::SEPARATOR)
      respond(client, '403 Forbidden', 'text/plain', 'Forbidden')
    elsif File.file?(full)
      body = File.binread(full)
      respond(client, '200 OK', TYPES[File.extname(full).downcase] || 'application/octet-stream', body)
    else
      respond(client, '404 Not Found', 'text/plain; charset=utf-8', "Not found: #{path}")
    end
  rescue StandardError => e
    warn "request failed: #{e.class}"
  ensure
    client.close rescue nil
  end
end
